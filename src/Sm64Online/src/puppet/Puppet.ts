import { INetworkPlayer } from 'modloader64_api/NetworkHandler';
import IMemory from 'modloader64_api/IMemory';
import * as API from 'SuperMario64/API/Imports';
import * as PData from './Instance';

export class Puppet extends API.BaseObj {
    commandBuffer: API.ICommandBuffer;
    nplayer: INetworkPlayer;
    data: PData.Data;
    id: string;
    scene: number;
    index: number;
    pointer: number;
    canHandle = false;
    isSpawned = false;

    log(msg: string) {
        console.info('info:    [Puppet] ' + msg);
    }

    constructor(
        emu: IMemory,
        commandBuffer: API.ICommandBuffer,
        nplayer: INetworkPlayer,
        player: API.IPlayer,
        pointer: number,
        index: number
    ) {
        super(emu);
        this.data = new PData.Data(emu, pointer, player, index);
        this.commandBuffer = commandBuffer;
        this.nplayer = nplayer;
        this.id = nplayer.uuid;
        this.scene = -1;
        this.index = index;
        this.pointer = pointer;
    }

    handleInstance(data: PData.Data) {
        if (!this.isSpawned || !this.canHandle) return;
        if (this.data.broken) return;
        Object.keys(data).forEach((key: string) => {
            (this.data as any)[key] = (data as any)[key];
        });

        // Broken puppet check
        if (this.data.broken) this.despawn();
    }

    spawn() {
        let ptr = this.emulator.dereferencePointer(this.pointer);
        this.isSpawned = (ptr !== 0x000000);
        this.canHandle = false;

        if (this.isSpawned) {
            this.canHandle = true;
            return;
        }

        this.commandBuffer.runCommand(
            API.CMD.SPAWN,
            this.index,
            (ptr: number) => {
                if (ptr === 0x000000) {
                    this.log('Spawn Failed');
                    return;
                }

                this.emulator.rdramWrite32(ptr + 0x0184, 0xDEADBEEF);
                this.isSpawned = true;
                this.canHandle = true;

                this.log('Puppet spawned! ' + ptr.toString(16).toUpperCase());
            }
        );
    }

    despawn() {
        let ptr = this.emulator.dereferencePointer(this.pointer);
        this.isSpawned = (ptr !== 0x000000);
        this.canHandle = false;

        if (!this.isSpawned) return;

        this.commandBuffer.runCommand(
            API.CMD.DESPAWN,
            this.index,
            (ptr: number) => {
                if (ptr !== 0x000000) {
                    this.log('Despawn Failed');
                    return;
                }

                this.isSpawned = false;
                this.data.broken = false;
                this.log('Puppet ' + this.id + ' despawned.');
            }
        );
    }
}
