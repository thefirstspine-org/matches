import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { ArenaRoomsService } from '../../rooms/arena-rooms.service';
import { GameAssetsService } from '../../game-assets/game-assets.service';
import { IGameWorker } from './game-worker.interface';
import { ThrowCardsGameWorker } from './throw-cards.game-worker';
import { MoveCreatureGameWorker } from './move-creature.game-worker';
import { PlaceCardGameWorker } from './place-card.game-worker';
import { SpellHealGameWorker } from './spell-heal.game-worker';
import { SpellInsaneHealGameWorker } from './spell-insane-heal.game-worker';
import { SpellPutrefactionGameWorker } from './spell-putrefaction.game-worker';
import { BaseGameService } from '../base.game.service';
import { ConfrontsGameWorker } from './confronts.game-worker';
import { SpellReconstructGameWorker } from './spell-reconstruct.game-worker';
import { SpellRuinGameWorker } from './spell-ruin.game-worker';
import { SpellThunderGameWorker } from './spell-thunder.game-worker';
import { StartConfrontsGameWorker } from './start-confronts.game-worker';
import { GameHookService } from '../game-hook/game-hook.service';
import { RunGameWorker } from './run.game-worker';
import { SkipRunGameWorker } from './skip-run.game-worker';
import { SpellReplacementGameWorker } from './spell-replacement.game-worker';
import { ReplaceCardGameWorker } from './replace-card.game-worker';
import { InsanesRunEffectGameWorker } from './insanes-run-effect.game-worker';
import { MonstrousPortalEffectGameWorker } from './monstrous-portal-effect.game-worker';
import { EndTurnGameWorker } from './end-turn.game-worker';
import { VolkaEffectGameWorker } from './volka-effect.game-worker';
import { SpellAlterTheFateGameWorker } from './spell-alter-the-fate.game-worker';
import { SpellEtherGameWorker } from './spell-ether.game-worker';
import { SpellFireGameWorker } from './spell-fire.game-worker';
import { SpellAchieveGameWorker } from './spell-achieve.game-worker';
import { SpellCureGameWorker } from './spell-cure.game-worker';
import { SpellTheVoidGameWorker } from './spell-the-void.game-worker';
import { SpellPainGameWorker } from './spell-pain.game-worker';
import { LogsService } from '@thefirstspine/logs-nest';
import { MessagingService } from '@thefirstspine/messaging-nest';
import { SpellReinforcementGameWorker } from './spell-reinforcement.game-worker';
import { SpellBloodStrengthGameWorker } from './spell-blood-strength.game-worker';
import { SpellInsaneRuinGameWorker } from './spell-insane-ruin.game-worker';
import { SpellInsanePutrefactionGameWorker } from './spell-insane-putrefaction.game-worker';
import { SpellInsaneReconstructGameWorker } from './spell-insane-reconstruct.game-worker';

/**
 * Main service that manages game workers. Each game worker is responsible of a game action type. This service
 * manages too dependency injections with the Injectable decorator to avoir circular dependencies at built-in.
 */
@Injectable()
export class GameWorkerService extends BaseGameService<IGameWorker> {

  protected initialized: boolean = false;

  constructor(
    private readonly messagingService: MessagingService,
    private readonly logsService: LogsService,
    private readonly gameAssetsService: GameAssetsService,
    private readonly arenaRoomsService: ArenaRoomsService,
    @Inject(forwardRef(() => GameHookService)) private readonly gameHookService: GameHookService,
  ) {
    super();
  }

  protected init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    // Defer injections for game workers constructions
    this.deferInjection(this.messagingService);
    this.deferInjection(this.logsService);
    this.deferInjection(this.gameAssetsService);
    this.deferInjection(this.arenaRoomsService);
    this.deferInjection(this.gameHookService);
    this.deferInjection(this); // haya!

    // Create workers
    const injectedProps = {gameWorkerService: this, gameHookService: this.gameHookService};
    this.createInjectable(ConfrontsGameWorker, injectedProps);
    this.createInjectable(MoveCreatureGameWorker, injectedProps);
    this.createInjectable(PlaceCardGameWorker, injectedProps);
    this.createInjectable(SpellHealGameWorker, injectedProps);
    this.createInjectable(SpellPutrefactionGameWorker, injectedProps);
    this.createInjectable(SpellInsanePutrefactionGameWorker, injectedProps);
    this.createInjectable(SpellReconstructGameWorker, injectedProps);
    this.createInjectable(SpellRuinGameWorker, injectedProps);
    this.createInjectable(SpellInsaneRuinGameWorker, injectedProps);
    this.createInjectable(SpellThunderGameWorker, injectedProps);
    this.createInjectable(StartConfrontsGameWorker, injectedProps);
    this.createInjectable(ThrowCardsGameWorker, injectedProps);
    this.createInjectable(RunGameWorker, injectedProps);
    this.createInjectable(SkipRunGameWorker, injectedProps);
    this.createInjectable(SpellReplacementGameWorker, injectedProps);
    this.createInjectable(ReplaceCardGameWorker, injectedProps);
    this.createInjectable(InsanesRunEffectGameWorker, injectedProps);
    this.createInjectable(MonstrousPortalEffectGameWorker, injectedProps);
    this.createInjectable(EndTurnGameWorker, injectedProps);
    this.createInjectable(VolkaEffectGameWorker, injectedProps);
    this.createInjectable(SpellAlterTheFateGameWorker, injectedProps);
    this.createInjectable(SpellEtherGameWorker, injectedProps);
    this.createInjectable(SpellFireGameWorker, injectedProps);
    this.createInjectable(SpellAchieveGameWorker, injectedProps);
    this.createInjectable(SpellCureGameWorker, injectedProps);
    this.createInjectable(SpellTheVoidGameWorker, injectedProps);
    this.createInjectable(SpellPainGameWorker, injectedProps);
    this.createInjectable(SpellReinforcementGameWorker, injectedProps);
    this.createInjectable(SpellBloodStrengthGameWorker, injectedProps);
    this.createInjectable(SpellInsaneHealGameWorker, injectedProps);
    this.createInjectable(SpellInsaneReconstructGameWorker, injectedProps);
  }

  /**
   * Get a built game worker.
   * TODO: Add a generic here
   * @param type
   */
  getWorker(type: string): IGameWorker {
    if (!this.initialized) {
      this.init();
    }
    return this.injectables.find((w: IGameWorker) => w.type === type);
  }

}
