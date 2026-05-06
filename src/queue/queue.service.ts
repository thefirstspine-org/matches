import { Injectable } from '@nestjs/common';
import { GameService } from '../game/game.service';
import { IGameUser, IGameInstance, IQueueInstance, IGameCard } from '@thefirstspine/types-matches';
import { ICard } from '@thefirstspine/types-game';
import { MessagingService } from '@thefirstspine/messaging-nest';
import { IQueueUser } from '@thefirstspine/types-matches/lib/queue-user.interface';

/**
 * Service to manage the game queue
 */
@Injectable()
export class QueueService {

  /**
   * Expiration time of a queue ask in seconds
   */
  public static readonly QUEUE__EXPIRATION_TIME: number = 60; // one minute seems a fair waiting time

  /**
   * The games queues
   */
  private queueInstances: IQueueInstance[] = [];

  /**
   * Fast lookup of users present in any queue (to avoid O(n*m) scans)
   */
  private usersInQueues: Set<number> = new Set();

  /**
   * Construtor. Initialize the queue property.
   */
  constructor(
    private readonly messagingService: MessagingService,
    private readonly gameService: GameService,
  ) {
    // Create base queues instances
    this.queueInstances.push(
      {
        key: 'default',
        queueUsers: [],
        createdAt: Date.now(),
        cards: [],
        coords: [{x: 3, y: 0}, {x: 3, y: 6}],
        instantMatchmaking: false,
      },
    );
  }

  /**
   * Create a queue instance. The created instance will expire in 30 minutes.
   * @param key
   * @param gameTypeId
   */
  async create(
    key: string,
    expirationTimeModifier: number,
    cards: IGameCard[],
    coords: {x: number, y: number}[],
    instantMatchmaking: boolean,
  ): Promise<IQueueInstance> {
    const instance: IQueueInstance = {
      key,
      queueUsers: [],
      expirationTimeModifier,
      createdAt: Date.now(),
      expiresAt: Date.now() + (60 * 30 * 1000),
      cards,
      coords,
      instantMatchmaking,
    };

    this.queueInstances.push(instance);

    this.messagingService.sendMessage(
      '*',
      'TheFirstSpine:queue:created',
      instance,
    );

    return instance;
  }

  /**
   * Get a queue instance.
   * @param key
   */
  getQueueInstance(key: string): IQueueInstance|undefined {
    return this.queueInstances.find((q) => q.key === key);
  }

  /**
   * Join a queue
   * @param key
   * @param user
   * @param destiny
   * @param origin
   * @param style
   * @param cover
   */
  async join(
    key: string,
    user: number,
    score: number,
    cards: ICard[],
  ): Promise<IQueueInstance> {
    // Exit method if user is in a queue
    if (this.isUserInAllQueues(user)) {
      throw new Error('User already in a queue.');
    }

    // Exit method if user is in a game instance
    if (this.gameService.isUserPlaying(user)) {
      throw new Error('User already in a game instance.');
    }

    // Check queue availability
    const queue: IQueueInstance|undefined = this.queueInstances.find((q) => q.key === key);
    if (!queue) {
      throw new Error('Queue instance not available. Check the key or retry in a few minutes.');
    }

    // Add the user in the queue
    queue.queueUsers.push({
      cards,
      user,
      score,
      queueExpiresAt: Date.now() + (QueueService.QUEUE__EXPIRATION_TIME * 1000),
    });

    // Maintain fast membership set
    this.usersInQueues.add(user);

    if (queue.instantMatchmaking && queue.queueUsers.length >= 2) {
      await this.processMatchmakingFor(queue);
    }

    // Send message
    this.messagingService.sendMessage(
      '*',
      `TheFirstSpine:queue:${key}:joined`,
      queue);

    return queue;
  }

  /**
   * Refresh queue join ask in order to avoid expiration
   * @param key
   * @param user
   */
  async refreshAsk(
    key: string,
    user: number,
  ): Promise<IQueueInstance> {
    // Exit method if user is not in the queue
    if (!this.isUserInQueue(key, user)) {
      throw new Error('User not in the queue.');
    }

    // Check queue availability
    const queue: IQueueInstance|undefined = this.queueInstances.find((q) => q.key === key);
    if (!queue) {
      throw new Error('Queue instance not available. Check the key or retry in a few minutes.');
    }

    // Refresh user queue's expiration date
    queue.queueUsers.forEach((queueUser: IQueueUser) => {
      if (queueUser.user === user) {
        queueUser.queueExpiresAt = Date.now() + (QueueService.QUEUE__EXPIRATION_TIME * 1000);
      }
    });

    return queue;
  }

  /**
   * Quit a queue
   * @param key
   * @param user
   * @returns {IQueueInstance}
   */
  quit(
    key: string,
    user: number,
  ): IQueueInstance {
    // Check queue availability
    const queue: IQueueInstance|undefined = this.queueInstances.find((q) => q.key === key);
    if (!queue) {
      throw new Error('Queue instance not available. Check the key or retry in a few minutes.');
    }

    // Send message
    this.messagingService.sendMessage(
      '*',
      `TheFirstSpine:queue:${key}:left`,
      queue);

    // Remove the user from the queue
    queue.queueUsers = queue.queueUsers.filter(u => u.user !== user);

    // Recalculate membership for this user: remove from set if not present anywhere
    const stillInAny = this.queueInstances.some(q => q.queueUsers.find(u => u.user === user));
    if (!stillInAny) {
      this.usersInQueues.delete(user);
    }

    return queue;
  }

  /**
   * Process matchmackings for all the available game types.
   */
  async processMatchmakings() {
    return Promise.all(this.queueInstances.map(this.processMatchmakingFor.bind(this)));
  }

  /**
   * Process the matchmaking for a given game type
   * @param queueInstance
   */
  async processMatchmakingFor(queueInstance: IQueueInstance): Promise<void> {
    // Get users in queue
    const queueUsers: IQueueUser[] = queueInstance.queueUsers;
    queueUsers.sort((a, b) => {
      if (a.score > b.score) {
        return 1;
      }
      if (a.score < b.score) {
        return -1;
      }
      return 0;
    });

    if (queueUsers.length >= 2) {
      // Extract the users needed from the queue
      const queueUsersNeeded: IQueueUser[] = queueUsers.splice(0, 2);

      // Create a game
      const game: IGameInstance = await this.gameService.createGameInstance(
        queueInstance.key,
        queueUsersNeeded.sort((a, b) => a.score - b.score),
        queueInstance.expirationTimeModifier ? queueInstance.expirationTimeModifier : 1,
        queueInstance.cards,
        queueInstance.coords,
      );

      // Make them quit from the queue
      queueUsersNeeded.forEach((queueUser: IGameUser) => this.quit(queueInstance.key, queueUser.user));

      // Send message
      this.messagingService.sendMessage(
        queueUsersNeeded.map(e => e.user),
        'TheFirstSpine:game:created',
        {
          gameId: game.id,
        },
      );
    }
  }

  /**
   * Looks for expired queue asks. A queue ask is expired when the delay of QUEUE__EXPIRATION_TIME
   * is passed.
   */
  async processExpiredQueueAsks() {
    return Promise.all(this.queueInstances.map(this.processExpiredQueueAsksFor.bind(this)));
  }

  /**
   * Manages expired queue asks for a given game type.
   * @param queueInstance
   */
  async processExpiredQueueAsksFor(queueInstance: IQueueInstance) {
    queueInstance.queueUsers = queueInstance.queueUsers.filter((queueUser: IQueueUser) => {
      if (queueUser.queueExpiresAt < Date.now()) {
        this.messagingService.sendMessage(
          [queueUser.user],
          'TheFirstSpine:queue:expired',
          queueInstance,
        );
        return false;
      }
      return true;
    });

    // Rebuild membership set for fast lookup (keeps consistency when multiple expirations happen)
    const users = new Set<number>();
    this.queueInstances.forEach((q) => q.queueUsers.forEach((u) => users.add(u.user)));
    this.usersInQueues = users;
  }

  /**
   * Looks for expired queues.
   */
  async processExpiredQueues() {
    this.queueInstances = this.queueInstances.filter((queueInstance: IQueueInstance) => {
      return queueInstance.expiresAt === undefined || queueInstance.expiresAt > Date.now();
    });
  }

  /**
   * Get if user in a queue
   * @param key
   * @param user
   */
  isUserInQueue(key: string, user: number): boolean {
    return !!this.queueInstances.find((q) => q.key === key)?.queueUsers.find((u: IQueueUser) => u.user === user);
  }

  /**
   * Get if user is in any queue
   * @param user
   */
  isUserInAllQueues(user: number): boolean {
    return this.usersInQueues.has(user);
  }

}
