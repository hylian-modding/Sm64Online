import { Packet, UDPPacket } from 'modloader64_api/ModLoaderDefaultImpls';
import * as PData from '../puppet/Instance';

export class SyncStorage extends Packet {
  save_data: Buffer = Buffer.alloc(0x70);
  star_count = 0;
  constructor(lobby: string, save_data: Buffer, star_count: number) {
    super('SyncStorage', 'Sm64Online', lobby, false);
    this.save_data = save_data;
    this.star_count = star_count;
  }
}

export class SyncBuffered extends Packet {
  value: Buffer;
  constructor(lobby: string, header: string, value: Buffer, persist: boolean) {
    super(header, 'Sm64Online', lobby, persist);
    this.value = value;
  }
}

export class SyncPointedBuffer extends Packet {
  address: number;
  data: Buffer;
  constructor(lobby: string, header: string, address: number, data: Buffer, persist: boolean) {
    super(header, 'Sm64Online', lobby, persist);
    this.address = address;
    this.data = data;
  }
}

export class SyncNumber extends Packet {
  value: number;
  constructor(lobby: string, header: string, value: number, persist: boolean) {
    super(header, 'Sm64Online', lobby, persist);
    this.value = value;
  }
}

// #################################################
// ##  Puppet Tracking
// #################################################

export class SyncPuppet extends UDPPacket {
  puppet: PData.Data;
  constructor(lobby: string, value: PData.Data) {
      super('SyncPuppet', 'Sm64Online', lobby, false);
      this.puppet = value;
  }
}