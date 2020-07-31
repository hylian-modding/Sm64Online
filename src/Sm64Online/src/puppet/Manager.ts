import { dummy } from './Dummy';
import { IModLoaderAPI } from 'modloader64_api/IModLoaderAPI';
import { INetworkPlayer } from 'modloader64_api/NetworkHandler';
import { Puppet } from './Puppet';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import IMemory from 'modloader64_api/IMemory';
import * as API from 'SuperMario64/API/Imports';
import * as Net from '../network/Packets';

export class PuppetManager {
    private emu!: IMemory;
    private core!: API.ISM64Core;
    private mapi!: IModLoaderAPI;
    private puppetArray: Puppet[] = [];
    private playerToPuppetMap: Map<string, number> = new Map<string, number>();
    private emptyPuppetSlot: number[] = new Array<number>();
    private awaitingSpawn: Puppet[] = new Array<Puppet>();
    private awaitingPuppets: INetworkPlayer[] = new Array<INetworkPlayer>();
    dummy!: Puppet;

    log(msg: string) {
        console.info('info:    [Puppet Manager] ' + msg);
    }

    postinit(
        emu: IMemory,
        core: API.ISM64Core,
        nplayer: INetworkPlayer,
        mapi: IModLoaderAPI
    ) {
        this.emu = emu;
        this.core = core;
        this.mapi = mapi;
        this.dummy = new Puppet(
            this.emu,
            core.commandBuffer,
            nplayer,
            core.player,
            0x0,
            -1
        );
        let addr = 0x803004;
        let offset: number;
        for (let i = 0; i < 16; i++) {
            offset = addr + i * 0x08;
            this.puppetArray.push(
                new Puppet(emu, core.commandBuffer, dummy, this.core.player, offset, i)
            );
            this.emptyPuppetSlot.push(i);
        }
    }

    reset() {
        this.emptyPuppetSlot.length = 0;
        for (let i = 0; i < this.puppetArray.length; i++) {
            this.puppetArray[i].scene = -1;
            this.puppetArray[i].nplayer = dummy;
            this.puppetArray[i].despawn();
            this.emptyPuppetSlot.push(i);
        }
        this.playerToPuppetMap.clear();
        this.awaitingSpawn.length = 0;
        this.awaitingPuppets.length = 0;
    }

    registerPuppet(nplayer: INetworkPlayer) {
        if (this.playerToPuppetMap.has(nplayer.uuid)) return;
        this.awaitingPuppets.push(nplayer);
    }

    unregisterPuppet(nplayer: INetworkPlayer) {
        if (!this.playerToPuppetMap.has(nplayer.uuid)) return;
        let index = this.playerToPuppetMap.get(nplayer.uuid)!;
        let puppet: Puppet = this.puppetArray[index];
        puppet.despawn();
        puppet.nplayer = dummy;
        puppet.scene = -1;
        this.playerToPuppetMap.delete(nplayer.uuid);
        this.mapi.logger.info(
            'Player ' +
            nplayer.nickname +
            ' has been removed from puppet management.'
        );
        this.emptyPuppetSlot.push(index);
    }

    get scene(): number { return this.dummy.scene; }
    set scene(scene: number) { this.dummy.scene = scene; }

    changePuppetScene(nplayer: INetworkPlayer, scene: number) {
        if (!this.playerToPuppetMap.has(nplayer.uuid)) {
            this.log('No puppet found for nplayer ' + nplayer.nickname + '.');
            return;
        }

        let puppet = this.puppetArray[this.playerToPuppetMap.get(nplayer.uuid)!];
        puppet.scene = scene;

        this.log('Puppet moved to scene[' + puppet.scene + ']');
    }

    handleNewPlayers() {
        if (this.awaitingPuppets.length < 1) return;
        if (this.emptyPuppetSlot.length < 1) return;
        let nplayer: INetworkPlayer = this.awaitingPuppets.splice(0, 1)[0];
        if (this.playerToPuppetMap.has(nplayer.uuid)) return;

        // Insert nplayer.
        let index = this.emptyPuppetSlot.shift() as number;
        this.puppetArray[index].nplayer = nplayer;
        this.playerToPuppetMap.set(nplayer.uuid, index);
        this.log('Assigned puppet to nplayer ' + nplayer.nickname + '.');
        this.mapi.clientSide.sendPacket(new Packet('Request_Scene', 'Sm64Online', this.mapi.clientLobby, true));
    }

    handleAwaitingSpawns() {
        if (this.awaitingSpawn.length < 1) return;
        while (this.awaitingSpawn.length > 0) {
            let puppet: Puppet = this.awaitingSpawn.shift() as Puppet;

            // Make sure we should still spawn
            if (this.scene !== -1 && puppet.scene === this.scene) puppet.spawn();
        }
    }

    puppetsInScene() {
        let count = 0;
        let scene = this.scene;
        for (let i = 0; i < this.puppetArray.length; i++) {
            if (scene !== -1 && this.puppetArray[i].scene === scene && this.puppetArray[i].isSpawned) count++;
        }
        return count;
    }

    handleSpawnState() {
        let meInScene = this.scene !== -1;

        if (meInScene) {
            // Perform normal checks.
            let puppetInScene: boolean;
            let puppetSpawned: boolean;
            let scene = this.scene;

            for (let i = 0; i < this.puppetArray.length; i++) {
                puppetInScene = this.puppetArray[i].scene === scene;
                puppetSpawned = this.puppetArray[i].isSpawned;
                if (puppetInScene && !puppetSpawned) {
                    // Needs Respawned.
                    this.awaitingSpawn.push(this.puppetArray[i]);
                } else if (
                    !puppetInScene && puppetSpawned) {
                    // Needs Despawned.
                    this.puppetArray[i].despawn();
                }
            }
        } else {
            // We aren't in scene, no one should be spawned!
            for (let i = 0; i < this.puppetArray.length; i++) {
                if (this.puppetArray[i].isSpawned) {
                    this.puppetArray[i].despawn();
                }
            }
        }
    }

    sendPuppet() {
        let pData = new Net.SyncPuppet(this.mapi.clientLobby, this.dummy.data);
        this.mapi.clientSide.sendPacket(pData);
    }

    handlePuppet(packet: Net.SyncPuppet) {
        if (this.core.runtime.get_is_paused()) return;
        
        if (!this.playerToPuppetMap.has(packet.player.uuid)) {
            this.registerPuppet(packet.player);
            return;
        }
        let puppet: Puppet = this.puppetArray[
            this.playerToPuppetMap.get(packet.player.uuid)!
        ];
        if (!puppet.canHandle) return;

        puppet.handleInstance(packet.puppet);
    }

    onTick(isSafe: boolean) {
        this.handleNewPlayers();
        if (isSafe) {
            this.handleAwaitingSpawns();
            this.sendPuppet();
        }
        this.handleSpawnState();
    }
}