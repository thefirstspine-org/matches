import { Injectable } from '@nestjs/common';
import { QueueService } from './../queue/queue.service';
import { GameService } from '../game/game.service';
import { LogsService } from '@thefirstspine/logs-nest';

/**
 * The ticker service will handle all the async operations, such as
 * game start, closing stales games, etc.
 */
@Injectable()
export class TickerService {

  protected tickCount: number = 0;

  constructor(
    private readonly queueService: QueueService,
    private readonly gameService: GameService,
    private readonly logsService: LogsService,
  ) {}

  /**
   * Main ticker method.
   * @param tickNumber
   */
  async tick(): Promise<void> {
    // Increase tick count
    this.tickCount ++;

    // Check expired queue asks every tick
    try {
      await this.queueService.processExpiredQueueAsks();
    } catch (e) {
      this.logsService.error(`Ticker queue asks expiration error`, {name: e.name, message: e.message, stack: e.stack});
    }

    // Manages expired queues every 30 ticks
    if (this.tickCount % 30 === 0) {
      try {
        await this.queueService.processExpiredQueues();
      } catch (e) {
        this.logsService.error(`Ticker queue expiration error`, {name: e.name, message: e.message, stack: e.stack});
      }
    }

    // Manages matchmaking every 30 ticks
    if (this.tickCount % 30 === 0) {
      try {
        await this.queueService.processMatchmakings();
      } catch (e) {
        this.logsService.error(`Ticker matchmaking error`, {name: e.name, message: e.message, stack: e.stack});
      }
    }

    // Manages expires games every 60 ticks
    if (this.tickCount % 60 === 0) {
      try {
        await this.gameService.processExpiredGames();
      } catch (e) {
        this.logsService.error(`Ticker expired games error`, {name: e.name, message: e.message, stack: e.stack});
      }
    }

    // Look for pending actions every tick
    try {
      await this.gameService.lookForPendingActions();
    } catch (e) {
      this.logsService.error(`Ticker game actions error`, {name: e.name, message: e.message, stack: e.stack});
    }
  }

}
