import { Injectable } from '@nestjs/common';
import { shuffle } from '../utils/array.utils';
import { randBetween } from '../utils/maths.utils';
import { IGameInstance, IGameUser, IGameCard, IGameAction, IGameInteraction } from '@thefirstspine/types-matches';
import { GameAssetsService } from '../game-assets/game-assets.service';
import { cardLocation, ICard } from '@thefirstspine/types-game';
import { IGameType, IDeck } from '@thefirstspine/types-game';
import { ArenaRoomsService } from '../rooms/arena-rooms.service';
import { GameWorkerService } from './game-worker/game-worker.service';
import { GameHookService } from './game-hook/game-hook.service';
import { LogsService } from '@thefirstspine/logs-nest';
import { MessagingService } from '@thefirstspine/messaging-nest';
import { InjectModel } from '@nestjs/mongoose';
import { GameInstance, GameInstanceDocument } from './game-instance.schema';
import { Model } from 'mongoose';

/**
 * Service to manage game instances
 */
@Injectable()
export class GameService {

  public static readonly MAX_CONCURRENT_GAMES: number = 100;
  public static readonly MAX_ARCHIVED_ACTIONS: number = 1000;

  /**
   * All the game instance stored in the hot memory. A game is in the hot memory
   * when it is considered as 'opened' by the system.
   */
  private gameInstances: {[id: number]: IGameInstance};

  constructor(
    private readonly messagingService: MessagingService,
    private readonly logsService: LogsService,
    private readonly arenaRoomsService: ArenaRoomsService,
    private readonly gameWorkerService: GameWorkerService,
    private readonly gameHookService: GameHookService,
    @InjectModel(GameInstance.name) private gameInstanceModel: Model<GameInstanceDocument>,
  ) {
    this.loadPendingGameInstances();
  }

  /**
   * Creates a game instance & store it in the hot memory
   * @param gameTypeId
   * @param gameUsers
   */
  async createGameInstance(
    queueKey: string,
    gameUsers: IGameUser[],
    expirationTimeModifier: number,
    startingCards: IGameCard[],
    coords: {x: number, y: number}[],
  ): Promise<IGameInstance> {
    // Generate a numeric ID to ensure retrocompatibility
    const gameInstanceId = Date.now();

    // Throws an error when max concurrent games is reached
    if (Object.keys(this.gameInstances).length >= GameService.MAX_CONCURRENT_GAMES) {
      throw new Error('Reached max concurrent games.');
    }

    // Create the decks
    const cards: IGameCard[] = [];
    cards.push(...JSON.parse(JSON.stringify(startingCards)));
    gameUsers.forEach((gameUser: IGameUser, index: number) => {
      gameUser.cards.forEach((card: ICard) => {
        const randomId: number = randBetween(0, Number.MAX_SAFE_INTEGER);
        cards.push({
          user: gameUser.user,
          location: card.type === 'player' ? 'board' : 'deck',
          coords: card.type === 'player' ? coords[index] : undefined,
          id: `${gameInstanceId}_${randomId}`,
          currentStats: card.stats ? JSON.parse(JSON.stringify(card.stats)) : undefined,
          metadata: {},
          card: JSON.parse(JSON.stringify(card)),
        });
      });
    });

    // Shuffle cards
    const shuffledCards: IGameCard[] = shuffle(cards);

    await Promise.all(gameUsers.map(async (gameUser: IGameUser, index: number) => {
      // Get the first 6 cards in the hand of each player
      let cardsTook: number = 0;
      shuffledCards.forEach((card: IGameCard) => {
        if (gameUser.user === card.user && card.location === 'deck' && cardsTook < 6) {
          card.location = 'hand';
          cardsTook ++;
        }
      });
    }));

    // Create the instance
    const gameInstance: IGameInstance = {
      queueKey,
      status: 'active',
      id: gameInstanceId,
      gameUsers,
      expirationTimeModifier,
      cards: shuffledCards,
      actions: {
        current: [],
        previous: [],
      },
      realm: process.env.REALM,
      queue: queueKey,
    };

    // Create the first action
    const action: IGameAction<IGameInteraction> = await this.gameWorkerService.getWorker('throw-cards')
      .create(gameInstance, {user: gameUsers[0].user});
    gameInstance.actions.current.push(action);

    // Save it
    await this.gameInstanceModel.create(gameInstance);
    this.gameInstances[gameInstanceId] = gameInstance;

    // Dispatch event with the created instance
    await this.gameHookService.dispatch(gameInstance, `game:created:standard:${gameInstance.id}`, {gameInstance});

    // Create the room in the rooms service
    this.arenaRoomsService.createRoomForGame(gameInstance);

    // Log
    this.logsService.info(`Game ${gameInstance.id} created`, gameInstance);

    // Return created instance
    return gameInstance;
  }

  /**
   * Get wether the user is playing already or not
   * @param user
   */
  isUserPlaying(user: number): boolean {
    return Object.keys(this.gameInstances).filter(
      (g) => {
        return this.gameInstances[g].users &&
          this.gameInstances[g].status === 'active' &&
          this.gameInstances[g].users.filter((u) => u.user === user).length > 0;
      },
    ).length > 0;
  }

  /**
   * Get an instance by id
   * @param user
   */
  async getGameInstance(id: number): Promise<IGameInstance|null> {
    // Get instance in hot memory
    const game: IGameInstance|null = this.gameInstances[id] ? this.gameInstances[id] : null;
    if (game) {
      return game;
    }

    // Get instance in cold memory
    const gameInstance: IGameInstance = await this.gameInstanceModel.findOne({id}).exec();
    return gameInstance;
  }

  async saveGameInstance(gameInstance: IGameInstance): Promise<IGameInstance> {
    await this.gameInstanceModel.updateOne({id: gameInstance.id}, gameInstance);
    this.gameInstances[gameInstance.id] = gameInstance;
    return this.getGameInstance(gameInstance.id);
  }

  /**
   * Get all game instances in hot memory
   */
  getGameInstances(): IGameInstance[] {
    return Object.keys(this.gameInstances).map(
      (gameInstanceId: string) => {
        return this.gameInstances[gameInstanceId];
      },
    );
  }

  /**
   * Purge an instance from the hot memory
   * @param gameInstance
   */
  async purgeFromMemory(gameInstance: IGameInstance) {
    // Ensure that the instance is written on the disk
    await this.saveGameInstance(gameInstance);
    // Deletes the instance from memory
    if (this.gameInstances[gameInstance.id]) {
      delete this.gameInstances[gameInstance.id];
    }
  }

  async loadPendingGameInstances() {
    // Get the current game instances at launch
    const realm: string|undefined = process.env.REALM;
    const instances: IGameInstance[] = await this.gameInstanceModel.find({status: 'active', realm}).exec();
    this.gameInstances = instances.reduce((acc: {[id: number]: IGameInstance}, instance: IGameInstance) => {
      acc[instance.id] = instance;
      return acc;
    }, {});
    if (process.env.PURGE_GAMES_AT_STARTUP === "true") {
      instances.forEach((i) => {
        i.status = "closed";
        this.purgeFromMemory(i);
      })
    }
  }

  /**
   * Respond to an action. This response is scopped by game instance, type & user.
   * @param gameInstanceId
   * @param actionType
   * @param user
   * @param response
   */
  async respondToAction(gameInstanceId: number, actionType: string, user: number, response: {[key: string]: any}) {
    this.logsService.info('Respond to action', { gameInstanceId, actionType, user, response });
    // Get game action
    const gameInstance = await this.getGameInstance(gameInstanceId);
    if (!gameInstance) {
      this.logsService.error('Game instance not found.', { gameInstanceId, actionType, user, response });
      return false;
    }

    // Get action
    const action: IGameAction<any>|undefined = gameInstance.actions.current.find((a: IGameAction<any>) => {
      return a.type === actionType && a.user === user;
    });
    if (!action) {
      this.logsService.error('Action not found.', { gameInstanceId, actionType, user, response });
      return false;
    }

    // Store response
    action.response = response;

    // Save instance
    await this.saveGameInstance(gameInstance);

    return true;
  }

  /**
   * Async process actions for a game instance
   * @param gameInstance
   */
  async processActionsFor(gameInstance: IGameInstance): Promise<void> {
    // this.logsService.info('Process actions for game instance.', { gameInstanceId: gameInstance.id });
    // Game instances should not be played if they are not active
    if (gameInstance.status !== 'active') {
      this.logsService.info('Game instance not active.', { gameInstanceId: gameInstance.id });
      await this.purgeFromMemory(gameInstance);
      return;
    }

    // A game instance SHOULD have at least one current action
    // Close a game without any action and throw an error, because this is not a normal behavior
    if (gameInstance.actions.current.length === 0) {
      this.logsService.error('Game opened without action', gameInstance);
      gameInstance.status = 'closed';
      await this.purgeFromMemory(gameInstance);
      return;
    }

    // Calculate the JSON hash of the game instance
    const jsonHash: string = JSON.stringify(gameInstance);

    // Get the max priority of the pending actions
    const maxPriority = gameInstance.actions.current.reduce((acc: number, action: IGameAction<IGameInteraction>) => {
      return action.priority > acc ? action.priority : acc;
    }, 0);

    // Treat only max priority action with a response (only one reponse will be treated in an instance per tick)
    const pendingGameAction: IGameAction<IGameInteraction>|undefined =
      gameInstance.actions.current
        .find((action: IGameAction<IGameInteraction>) => action.priority === maxPriority && action.response !== undefined);

    // Executes the game actions when exists
    if (pendingGameAction) {
      // this.logsService.info('Execute game action.', { gameAction: pendingGameAction });
      try {
        if (await this.gameWorkerService.getWorker(pendingGameAction.type).execute(gameInstance, pendingGameAction)) {
          // Dispatch event after each action
          this.gameHookService
            .dispatch(gameInstance, `action:executed:${pendingGameAction.type}`, {user: pendingGameAction.user, action: pendingGameAction});
          // Send to the other players that the action succeed
          this.messagingService.sendMessage(
            '*',
            `TheFirstSpine:game:${gameInstance.id}:action`,
            pendingGameAction,
          );
          // Okay, deletes the action
          await this.gameWorkerService.getWorker(pendingGameAction.type).delete(gameInstance, pendingGameAction);
          // Dispatch event after each action
          this.gameHookService.dispatch(gameInstance, `action:deleted:${pendingGameAction.type}`, {user: pendingGameAction.user});
          // Save the instance
          await this.saveGameInstance(gameInstance);
        } else {
          // Something's wrong, delete the response
          this.logsService.error('Cannot execute game action', { gameAction: pendingGameAction });
          pendingGameAction.response = undefined;
        }
      } catch (e) {
        // tslint:disable-next-line:no-console
        this.logsService.error(`Error in process action`, {name: e.name, message: e.message, stack: e.stack});
      }
    }

    // Get the pending game actions with expiration
    const promises: Array<Promise<any>> = gameInstance.actions.current.map(async (gameAction: IGameAction<IGameInteraction>) => {
      try {
        if (gameAction.expiresAt && gameAction.expiresAt < Date.now() && gameAction.priority === maxPriority) {
          await this.gameWorkerService.getWorker(gameAction.type).expires(gameInstance, gameAction);
          // Dispatch event after each action
          this.gameHookService.dispatch(gameInstance, `action:expired:${gameAction.type}`, {user: gameAction.user, action: gameAction});
        }
      } catch (e) {
        // tslint:disable-next-line:no-console
        this.logsService.error(`Error in expire action`, e);
      }
    });

    // Wait for pending promises
    await Promise.all(promises);

    // Refresh the pending actions
    const refreshPromises: Array<Promise<void>> = gameInstance.actions.current.map(async (action: IGameAction<IGameInteraction>) => {
        await this.gameWorkerService.getWorker(action.type).refresh(gameInstance, action);
        return this.gameHookService.dispatch(gameInstance, `action:refreshed:${action.type}`, {user: action.user, action});
    });
    await Promise.all(refreshPromises);

    // Exit method when no changes
    if (JSON.stringify(gameInstance) === jsonHash) {
      // this.logsService.info('No changes in the game instance.', { gameAction: pendingGameAction });
      return;
    }

    // Reduce archived actions
    if (gameInstance.actions.previous.length > GameService.MAX_ARCHIVED_ACTIONS) {
      gameInstance.actions.previous.splice(0, gameInstance.actions.previous.length - GameService.MAX_ARCHIVED_ACTIONS);
    }

    // Save game instance
    await this.saveGameInstance(gameInstance);

    // Look for status at the end of this run and purge the game from memory if not opened
    if (gameInstance.status !== 'active') {
      this.logsService.info('Game instance not active after execution.', { gameInstanceId: gameInstance.id });
      await this.purgeFromMemory(gameInstance);
    }
  }

  async addCard(gameInstanceId: number, user: number, card: ICard, location?: cardLocation, coords?: {x: number, y: number}): Promise<boolean> {
    const gameInstance = await this.getGameInstance(gameInstanceId);

    if (!gameInstance) {
      this.logsService.error('Game instance not found.', { gameInstanceId });
      return false;
    }

    if (gameInstance.status !== 'active') {
      this.logsService.info('Game instance not active.', { gameInstanceId: gameInstance.id });
      await this.purgeFromMemory(gameInstance);
      return false;
    }

    const randomId: number = randBetween(0, Number.MAX_SAFE_INTEGER);
    const gameCard: IGameCard = {
      user,
      location: location ? location : 'deck',
      coords: coords ? coords : undefined,
      id: `${gameInstance.id}_${randomId}`,
      currentStats: card.stats ? JSON.parse(JSON.stringify(card.stats)) : undefined,
      metadata: {},
      card: JSON.parse(JSON.stringify(card)),
    };
    gameInstance.cards.push(gameCard);

    // Refresh the pending actions
    const refreshPromises: Array<Promise<void>> = gameInstance.actions.current.map(async (action: IGameAction<IGameInteraction>) => {
        await this.gameWorkerService.getWorker(action.type).refresh(gameInstance, action);
        return this.gameHookService.dispatch(gameInstance, `action:refreshed:${action.type}`, {user: action.user, action});
    });
    await Promise.all(refreshPromises);

    // Notify users
    await this.messagingService.sendMessage(
      gameInstance.gameUsers.map((u: IGameUser) => u.user),
      `TheFirstSpine:game:${gameInstance.id}:cardChanged`,
      {
        changes: {
        },
        gameCard,
      });

    await this.saveGameInstance(gameInstance);

    return true;
  }

  async lookForPendingActions() {
    // Main loop on the games instances
    return Promise.all(this.getGameInstances().map(this.processActionsFor.bind(this)));
  }

  /**
   * Surrend a game.
   * @param id The ID of the game
   * @param user The user who abandon the game
   */
  async concedeGame(id: number, user: number) {
    // Find the instance
    const instance: IGameInstance|undefined = this.gameInstances[id];
    if (!instance || instance.status !== 'active') {
      return false;
    }

    // Find the user's card
    const userCard = instance.cards.find((card: IGameCard) => {
      return card.card.type === 'player' && card.user === user;
    });
    if (!userCard) {
      return false;
    }

    // Find the opponent's card
    const enemyCard = instance.cards.find((card: IGameCard) => {
      return card.card.type === 'player' && card.user !== user;
    });
    if (!enemyCard) {
      return false;
    }

    const lifeLeft: number = userCard.currentStats.life;
    userCard.currentStats.life = 0;
    await this.gameHookService.dispatch(
      instance,
      `card:lifeChanged:damaged:${userCard.card.type}:${userCard.card.id}`,
      {
        gameCard: userCard,
        source: enemyCard,
        lifeChanged: -lifeLeft,
      });

    // Set the status of the game when closed
    instance.status = 'conceded';

  }

  async getActiveGameInstanceForUser(user: number): Promise<IGameInstance | undefined> {
    const instance: IGameInstance | undefined =
      await this.gameInstanceModel.findOne({status: 'active', 'gameUsers.user': user}).exec();
    return instance;
  }

}
