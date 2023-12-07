import { DynamicModule, Module } from '@nestjs/common';
import { ApiController } from './api/api.controller';
import { ApiService } from './api/api.service';
import { GameService } from './game/game.service';
import { QueueService } from './queue/queue.service';
import { TickerController } from './ticker/ticker.controller';
import { TickerService } from './ticker/ticker.service';
import { RestService } from './rest/rest.service';
import { RoomsService } from './rooms/rooms.service';
import { ArenaRoomsService } from './rooms/arena-rooms.service';
import { GameWorkerService } from './game/game-worker/game-worker.service';
import { GameHookService } from './game/game-hook/game-hook.service';
import { BotsService } from './bots/bots.service';
import { IndexController } from './index/index.controller';
import { AuthService } from '@thefirstspine/auth-nest';
import { LogsService } from '@thefirstspine/logs-nest';
import { MessagingService } from '@thefirstspine/messaging-nest';
import { MongooseModule } from '@nestjs/mongoose';
import { GameInstance, GameInstanceSchema } from './game/game-instance.schema';
import { NetworkRoomsDriver } from './rooms/drivers/network.rooms.driver';

@Module({
  controllers: [ApiController, TickerController, IndexController],
  providers: [
    ApiService,
    GameService,
    QueueService,
    TickerService,
    AuthService,
    LogsService,
    RestService,
    {
      provide: RoomsService,
      useFactory: (logsService: LogsService) => {
        return new RoomsService(new NetworkRoomsDriver(), logsService);
      },
      inject: [LogsService],
    },
    ArenaRoomsService,
    MessagingService,
    GameWorkerService,
    GameHookService,
    BotsService,
  ],
})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        MongooseModule.forRoot(`mongodb://${process.env.MONGO_HOST}/${process.env.MONGO_DB}`),
        MongooseModule.forFeature([
          { name: GameInstance.name, schema: GameInstanceSchema },
        ]),
      ],
    };
  }
}
