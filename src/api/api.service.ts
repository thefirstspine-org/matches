import { Injectable } from '@nestjs/common';
import { ApiError } from './api.error';
import { QueueService } from './../queue/queue.service';
import { GameService } from '../game/game.service';
import { IGameUser,
         IGameInstance,
         IGameCard,
         IGameAction,
         IApiRespondToActionParams,
         IApiRespondToActionResponse,
         IApiRequest,
         IApiGetGameResponse,
         IApiRefreshQueueAskParams,
         IApiJoinQueueParams,
         IApiQuitQueueParams,
         IGameInteraction,
         IApiGetQueueParams,
         IQueueInstance} from '@thefirstspine/types-matches';
import { randBetween } from '../utils/maths.utils';
import { validate, ValidationError } from 'class-validator';
import { ApiCreateQueueDto } from './api-create-queue.dto';
import { ApiGetQueueDto } from './api-get-queue.dto';
import { ApiJoinQueueDto } from './api-join-queue.dto';
import { ApiRefreshQueueAskDto } from './api-refresh-queue-ask.dto';
import { ApiQuitQueueDto } from './api-quit-queue.dto';
import { ApiRespondToActionDto } from './api-respond-to-action.dto';

/**
 * All the methods of the API are mapped here. The controller will call that
 * service in order to manage parties.
 */
@Injectable()
export class ApiService {

  constructor(
    private readonly queueService: QueueService,
    private readonly gameService: GameService,
  ) {}

  /**
   * Create a queue in the queue service
   * @param request
   */
  async createQueue(request: IApiRequest<ApiCreateQueueDto>): Promise<IQueueInstance> {
    // Validate input
    await this.validateAgainst(request.params, ApiCreateQueueDto);

    // Generate key
    const key: string = request.params.key ? request.params.key : randBetween(1111, 9999).toString(10);

    // Create the the instance
    const queue: IQueueInstance = await this.queueService.create(
      key,
      request.params.expirationTimeModifier ? request.params.expirationTimeModifier : 1,
      request.params.cards ? request.params.cards : [],
    );

    // Return response
    return {
      ...queue,
    };
  }

  /**
   * Get a queue in the queue service
   * @param request
   */
  async getQueue(request: IApiRequest<IApiGetQueueParams>): Promise<IQueueInstance> {
    // Validate input
    await this.validateAgainst(request.params, ApiGetQueueDto);

    // Create the the instance
    const queue: IQueueInstance = this.queueService.getQueueInstance(request.params.key);
    if (!queue) {
      throw new ApiError('Unknown queue', ApiError.CODE_INVALID_PARAMS);
    }

    // Return response
    return {
      ...queue,
    };
  }

  /**
   * Join a queue in the queue service for 60 seconds. This joining request should be
   * refreshed with the `refreshQueueAsk` method.
   * @param request
   */
  async joinQueue(request: IApiRequest<IApiJoinQueueParams>): Promise<IQueueInstance> {
    // Validate input
    await this.validateAgainst(request.params, ApiJoinQueueDto);

    const queue: IQueueInstance = await this.queueService.join(
      request.params.key,
      request.user,
      request.params.score,
      request.params.cards,
    );

    return {
      ...queue,
    };
  }

  /**
   * Refresh the joining request, and set the expiration date to 60 seconds from this refresh.
   * @param request
   */
  async refreshQueueAsk(request: IApiRequest<IApiRefreshQueueAskParams>): Promise<IQueueInstance> {
    // Validate input
    await this.validateAgainst(request.params, ApiRefreshQueueAskDto);

    const queue: IQueueInstance = await this.queueService.refreshAsk(
      request.params.key,
      request.user,
    );

    return {
      ...queue,
    };
  }

  /**
   * Quit a queue in the queue service
   * @param request
   */
  async quitQueue(request: IApiRequest<IApiQuitQueueParams>): Promise<IQueueInstance> {
    // Validate input
    await this.validateAgainst(request.params, ApiQuitQueueDto);

    const queue: IQueueInstance = this.queueService.quit(request.params.key, request.user);

    return {
      ...queue,
    };
  }

  /**
   * Get the current game to player joined previously.
   * @param request
   */
  async getCurrentGame(request: IApiRequest<undefined>): Promise<IApiGetGameResponse> {
    const gameInstance: IGameInstance|undefined = this.gameService.getGameInstances().find(
      (g: IGameInstance) => g.gameUsers.find((u: IGameUser) => u.user === request.user) !== undefined);

    if (!gameInstance) {
      throw new ApiError('Not opened game instance found.', ApiError.CODE_METHOD_NOT_FOUND);
    }

    // Set ID in the request & call the getGame method
    request.id = gameInstance.id;
    return this.getGame(request);
  }

  /**
   * Get a game instance. The `id` field must be filled for this method.
   * @param request
   */
  async getGame(request: IApiRequest<undefined>): Promise<IApiGetGameResponse> {
    // Get the ID of the game
    const id: number|undefined = request.id;
    if (!id) {
      throw new ApiError('Required ID.', ApiError.CODE_INVALID_REQUEST);
    }

    // Get the game instance
    const gameInstance: IGameInstance|null = await this.gameService.getGameInstance(id);
    if (!gameInstance) {
      throw new ApiError('Unknown game instance.', ApiError.CODE_METHOD_NOT_FOUND);
    }

    // Get stats
    const cardsInHand: {[key: number]: number} = {};
    const cardsInDeck: {[key: number]: number} = {};
    gameInstance.cards.forEach((c: IGameCard) => {
      if (c.location === 'hand') {
        cardsInHand[c.user] = cardsInHand[c.user] ? cardsInHand[c.user] + 1 : 1;
      }
      if (c.location === 'deck') {
        cardsInDeck[c.user] = cardsInDeck[c.user] ? cardsInDeck[c.user] + 1 : 1;
      }
    });
    const stats: {
      cardsInHand: {user: number, value: number}[],
      cardsInDeck: {user: number, value: number}[],
    } = {
      cardsInHand: Object.keys(cardsInHand).map((k) => { return {user: parseInt(k, 10), value: cardsInHand[k]} }),
      cardsInDeck: Object.keys(cardsInDeck).map((k) => { return {user: parseInt(k, 10), value: cardsInDeck[k]} }),
    };

    return {
      id: gameInstance.id,
      status: gameInstance.status,
      result: gameInstance.result,
      stats,
      users: gameInstance.gameUsers.map((u) => u.user),
      queue: gameInstance.queueKey,
    };
  }

  /**
   * Get cards in a game instance. Only the cards visible for the current player are visible (e.g. cards
   * on board, on the discards and on the player's hand). The `id` field must be filled for this method.
   * @param request
   */
  async getCards(request: IApiRequest<undefined>): Promise<IGameCard[]> {
    // Get the ID of the game
    const id: number|undefined = request.id;
    if (!id) {
      throw new ApiError('Required ID.', ApiError.CODE_INVALID_REQUEST);
    }

    // Get the game instance
    const gameInstance: IGameInstance|null = await this.gameService.getGameInstance(id);
    if (!gameInstance) {
      throw new ApiError('Unknown game instance.', ApiError.CODE_METHOD_NOT_FOUND);
    }

    // Get the cards in the board OR in the discard OR in the user's deck OR in the user's hand
    return gameInstance.cards.filter(
      (card: IGameCard) => {
        return card.location !== 'deck' && (
          card.location === 'board'
          || card.location === 'discard'
          || card.location === 'banned'
          || (card.location === 'hand' && card.user === request.user)
        );
      },
    );
  }

  /**
   * Get the actions available for the current player. The `id` field must be filled for this method.
   * @param request
   */
  async getActions(request: IApiRequest<undefined>): Promise<Array<IGameAction<IGameInteraction>>> {
    // Get the ID of the game
    const id: number|undefined = request.id;
    if (!id) {
      throw new ApiError('Required ID.', ApiError.CODE_INVALID_REQUEST);
    }

    // Get the game instance
    const gameInstance: IGameInstance|null = await this.gameService.getGameInstance(id);
    if (!gameInstance) {
      throw new ApiError('Unknown game instance.', ApiError.CODE_METHOD_NOT_FOUND);
    }

    // Wipe all the actions for a non active game
    if (gameInstance.status !== 'active') {
      throw new ApiError('Non-opened game instance.', ApiError.CODE_INVALID_REQUEST);
    }

    // Get the max priority of the pending actions
    const maxPriority = gameInstance.actions.current.reduce((acc: number, action: IGameAction<IGameInteraction>) => {
      return action.priority > acc ? action.priority : acc;
    }, 0);

    // Get the cards in the board OR in the discard OR in the user's deck OR in the user's hand
    return gameInstance.actions.current.filter(
      (action: IGameAction<IGameInteraction>) => {
        return action.user === request.user && action.priority === maxPriority;
      },
    );
  }

  /**
   * Respond to an action. The `id` field must be filled for this method.
   * @param request
   */
  async respondToAction(request: IApiRequest<IApiRespondToActionParams>): Promise<IApiRespondToActionResponse> {
    // Validate input
    await this.validateAgainst(request.params, ApiRespondToActionDto);

    // Get the ID of the game
    const id: number|undefined = request.id;
    if (!id) {
      throw new ApiError('Required ID.', ApiError.CODE_INVALID_REQUEST);
    }

    // Get the game instance
    const gameInstance: IGameInstance|null = await this.gameService.getGameInstance(id);
    if (!gameInstance) {
      throw new ApiError('Unknown game instance.', ApiError.CODE_METHOD_NOT_FOUND);
    }

    // Cannot respond to a non-opened game instance
    if (gameInstance.status !== 'active') {
      throw new ApiError('Non active game instance.', ApiError.CODE_INVALID_REQUEST);
    }

    // Store the response in the instance
    const sent: boolean = await this.gameService.respondToAction(
      gameInstance.id,
      request.params.actionType,
      request.user,
      request.params.response);

    // Response not sent
    return {
      sent,
    };
  }

  /**
   * Concede a game.
   * @param request
   */
  async concede(request: IApiRequest<undefined>): Promise<IApiGetGameResponse> {
    // Get the ID of the game
    const id: number|undefined = request.id;
    if (!id) {
      throw new ApiError('Required ID.', ApiError.CODE_INVALID_REQUEST);
    }

    // Get the game instance
    const gameInstance: IGameInstance|null = await this.gameService.getGameInstance(id);
    if (!gameInstance) {
      throw new ApiError('Unknown game instance.', ApiError.CODE_METHOD_NOT_FOUND);
    }

    // Is the user part of this instance?
    if (gameInstance.gameUsers.find((u) => u.user === request.user) === undefined) {
      throw new ApiError('Not in a game instance.', ApiError.CODE_INVALID_REQUEST);
    }

    await this.gameService.concedeGame(id, request.user);

    return this.getGame(request);
  }

  protected async validateAgainst(data: any, classValidator: (new() => void)): Promise<boolean> {
    const built: any = new classValidator();
    Object.keys(data).forEach((property: string) => built[property] = data[property]);

    const result: ValidationError[] = await validate(built);
    if (result.length) {
      const errorParams: string = result.map((error: ValidationError) => error.property).join(', ');
      throw new ApiError(`Invalid method parameter${(result.length > 1 ? 's' : '')}: ${errorParams}`, ApiError.CODE_INVALID_PARAMS);
    }
    return true;
  }

}
