import IMemory from 'modloader64_api/IMemory';
import * as API from 'SuperMario64/API/Imports';

export class Data extends API.BaseObj implements Data {
    private readonly copyFields: string[] = new Array<string>();
    player: API.IPlayer;
    pointer: number;
    index: number;
    broken: boolean = false;
    private curAnim = -1;

    constructor(emu: IMemory, pointer: number, player: API.IPlayer, index: number) {
        super(emu);
        this.pointer = pointer;
        this.player = player;
        this.index = index;
        this.copyFields.push('anim');
        this.copyFields.push('fnim');
        this.copyFields.push('col');
        this.copyFields.push('yoff');
        this.copyFields.push('pos');
        this.copyFields.push('rot');
        this.copyFields.push('vis');
    }

    safetyCheck(): number {
        let ret = 0x000000;
        if (this.broken) return ret;

        let ptr: number = this.emulator.dereferencePointer(this.pointer);        
        if (this.emulator.rdramRead32(ptr + 0x0184) !== 0xDEADBEEF) {
            this.broken = true;
            return ret;
        }

        return ptr;
    }

    get anim(): number {
        return this.player.animation_id;
    }
    set anim(val: number) {
        let ptr: number = this.safetyCheck();
        if (ptr === 0x000000) return;

        if (val === this.curAnim) return;

        // Attempt to get animation data from our records
        let buf = this.player.get_animation(val);
        if (buf === undefined) return;
        
        // Save current animation value
        this.curAnim = val;

        // Set anim pointer
        let anim_ptr = 0x804000 + this.index * 0x3288;
        this.emulator.rdramWrite32(ptr + 0x3C, 0x80000000 + anim_ptr);

        // Write anim
        this.emulator.rdramWriteBuffer(anim_ptr, buf);

        // Repoint anim
        let anim_value = anim_ptr + buf.readUInt32BE(0x0C);
        let anim_index = anim_ptr + buf.readUInt32BE(0x10);
        this.emulator.rdramWrite32(anim_ptr + 0x0c, anim_value);
        this.emulator.rdramWrite32(anim_ptr + 0x10, anim_index);
    }

    get fnim(): Buffer {
        return this.player.animation_block_data;
    }
    set fnim(val: Buffer) {
        let ptr: number = this.safetyCheck();
        if (ptr === 0x000000) return;
        this.emulator.rdramWriteBuffer(ptr + 0x40, val);
    }

    get col(): number {
        return 0;
    }
    set col(val: number) {
        let ptr: number = this.safetyCheck();
        if (ptr === 0x000000) return;

        // Writes collision handled to 0 after every frame
        this.emulator.rdramWrite32(ptr + 0x134, val);
    }

    get yoff(): number {
        return this.player.y_offset;
    }
    set yoff(val: number) {
        let ptr: number = this.safetyCheck();
        if (ptr === 0x000000) return;

        // Marks marios height (in case sinking in sand)
        this.emulator.rdramWrite16(ptr + 0x3A, val);
    }

    get pos(): Buffer {
        return this.player.position;
    }
    set pos(val: Buffer) {
        let ptr: number = this.safetyCheck();
        if (ptr === 0x000000) return;

        this.emulator.rdramWriteBuffer(ptr + 0xA0, val);
    }

    get rot(): Buffer {
        return this.player.rotation;
    }
    set rot(val: Buffer) {
        let ptr: number = this.safetyCheck();
        if (ptr === 0x000000) return;

        this.emulator.rdramWriteBuffer(ptr + 0xD0, val);
    }

    get vis(): boolean {
        return this.player.visible;
    }
    set vis(val: boolean) {
        let ptr: number = this.safetyCheck();
        if (ptr === 0x000000) return;

        this.emulator.rdramWrite16(ptr + 0x02, val ? 0x21 : 0x20);
    }

    toJSON() {
        const jsonObj: any = {};

        for (let i = 0; i < this.copyFields.length; i++) {
            jsonObj[this.copyFields[i]] = (this as any)[this.copyFields[i]];
        }

        return jsonObj;
    }
}
