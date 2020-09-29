import {
	EventsClient,
	EventServerJoined,
	EventServerLeft,
	EventHandler,
	EventsServer,
} from 'modloader64_api/EventHandler';
import { IModLoaderAPI, IPlugin, IPluginServerConfig } from 'modloader64_api/IModLoaderAPI';
import {
	INetworkPlayer,
	LobbyData,
	NetworkHandler,
	ServerNetworkHandler,
} from 'modloader64_api/NetworkHandler';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import * as API from 'SuperMario64/API/Imports';
import * as Net from './network/Imports';
import * as Puppet from './puppet/Imports';
import { onPostTick } from 'modloader64_api/PluginLifecycle';

export class Sm64Online implements IPlugin, IPluginServerConfig {
	ModLoader = {} as IModLoaderAPI;
	name = 'Sm64Online';

	@InjectCore() core!: API.ISM64Core;

	// Storage Variables
	cDB = new Net.DatabaseClient();

	// Puppet Handler
	protected pMgr!: Puppet.PuppetManager;

	// Helpers
	protected curScene: number = -1;
	protected isPaused: boolean = false;

	handle_scene_change(scene: number) {
		if (scene === this.curScene) return;

		// Set global to current scene value
		this.curScene = scene;

		this.ModLoader.clientSide.sendPacket(new Net.SyncNumber(this.ModLoader.clientLobby, "SyncScene", scene, true));
		this.ModLoader.logger.info('Moved to scene[' + scene + '].');
	}

	handle_puppets(scene: number, visible: boolean) {
		this.pMgr.scene = scene;
		this.pMgr.onTick(this.curScene !== -1 && visible);
	}

	handle_save_flags(bufData: Buffer, bufStorage: Buffer, profile: number) {
		// Initializers
		let pData: Net.SyncBuffered;
		let i: number;
		let count: number;
		let needUpdate = false;

		bufData = this.core.save[profile].get_all();
		bufStorage = this.cDB.save_data;
		count = bufData.byteLength;
		needUpdate = false;

		for (i = 0; i < count; i++) {
			if (bufData[i] === bufStorage[i]) continue;

			bufData[i] |= bufStorage[i];
			this.core.save[profile].set(i, bufData[i]);
			needUpdate = true;
		}

		// Send Changes to Server
		if (!needUpdate) return;
		this.cDB.save_data = bufData;
		pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncSaveFile', bufData, false);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	handle_star_count() {
		// Initializers
		let pData: Net.SyncNumber;
		let val: number;
		let valDB: number;
		let needUpdate = false;

		val = this.core.runtime.star_count;
		valDB = this.cDB.star_count;

		// Detect Changes
		if (val === valDB) return;

		// Process Changes
		if (val > valDB) {
			this.cDB.star_count = val;
			needUpdate = true;
		} else {
			this.core.runtime.star_count = valDB;
		}

		// Send Changes to Server
		if (!needUpdate) return;
		pData = new Net.SyncNumber(this.ModLoader.clientLobby, 'SyncStarCount', val, false);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	constructor() { }

	preinit(): void { this.pMgr = new Puppet.PuppetManager(); }

	init(): void { }

	postinit(): void {
		// Puppet Manager Inject
		this.pMgr.postinit(
			this.ModLoader.emulator,
			this.core,
			this.ModLoader.me,
			this.ModLoader
		);

		this.ModLoader.logger.info('Puppet manager activated.');
	}

	onTick(): void {
		if (!this.core.player.exists) return;

		if (this.ModLoader.emulator.rdramRead32(0x8033EFFC) < 50){
			return;
		}

		this.cDB.hasHat = this.ModLoader.emulator.rdramReadBit8(0x8033B177, 0x3);

		// Initializers
		let paused: boolean = this.core.runtime.get_is_paused();
		let profile: number = this.core.runtime.get_current_profile();
		let scene: number = this.core.runtime.get_current_scene();
		let visible: boolean = this.core.player.visible;
		let bufStorage: Buffer;
		let bufData: Buffer;

		// General Setup/Handlers
		this.handle_scene_change(scene);
		this.handle_puppets(scene, visible);

		// Progress Flags Handlers
		this.handle_save_flags(bufData!, bufStorage!, profile);
		this.handle_star_count();
	}

	@onPostTick()
	onPostTick(){
		this.ModLoader.emulator.rdramWriteBit8(0x8033B177, 0x3, this.cDB.hasHat);
	}

	getServerURL(): string { return "192.99.70.23:8040"; }

	@EventHandler(EventsClient.ON_INJECT_FINISHED)
	onClient_InjectFinished(evt: any) { }

	@EventHandler(EventsServer.ON_LOBBY_CREATE)
	onServer_LobbyCreate(lobby: string) {
		this.ModLoader.lobbyManager.createLobbyStorage(
			lobby,
			this,
			new Net.DatabaseServer()
		);
	}

	@EventHandler(EventsClient.ON_LOBBY_JOIN)
	onClient_LobbyJoin(lobby: LobbyData): void {
		this.cDB = new Net.DatabaseClient();
		let pData = new Packet('Request_Storage', 'Sm64Online', this.ModLoader.clientLobby, false);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	@EventHandler(EventsServer.ON_LOBBY_JOIN)
	onServer_LobbyJoin(evt: EventServerJoined) {
		let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
		storage.players[evt.player.uuid] = -1;
		storage.playerInstances[evt.player.uuid] = evt.player;
	}

	@EventHandler(EventsServer.ON_LOBBY_LEAVE)
	onServer_LobbyLeave(evt: EventServerLeft) {
		let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
		delete storage.players[evt.player.uuid];
		delete storage.playerInstances[evt.player.uuid];
	}

	@EventHandler(EventsClient.ON_SERVER_CONNECTION)
	onClient_ServerConnection(evt: any) {
		this.pMgr.reset();
		if (this.core.runtime === undefined || !this.core.player.exists) return;
		let pData = new Net.SyncNumber(this.ModLoader.clientLobby, "SyncScene", this.curScene, true);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	@EventHandler(EventsClient.ON_PLAYER_JOIN)
	onClient_PlayerJoin(nplayer: INetworkPlayer) {
		this.pMgr.registerPuppet(nplayer);
	}

	@EventHandler(EventsClient.ON_PLAYER_LEAVE)
	onClient_PlayerLeave(nplayer: INetworkPlayer) {
		this.pMgr.unregisterPuppet(nplayer);
	}

	// #################################################
	// ##  Server Receive Packets
	// #################################################

	@ServerNetworkHandler('Request_Storage')
	onServer_RequestStorage(packet: Packet): void {
		this.ModLoader.logger.info('[Server] Sending: {Lobby Storage}');
		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

		// Safety check
		if (sDB === null) return;

		let pData = new Net.SyncStorage(packet.lobby, sDB.save_data, sDB.star_count);
		this.ModLoader.serverSide.sendPacketToSpecificPlayer(pData, packet.player);
	}

	@ServerNetworkHandler('SyncSaveFile')
	onServer_SyncSaveFile(packet: Net.SyncBuffered) {
		this.ModLoader.logger.info('[Server] Received: {Save File}');

		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

		// Safety check
		if (sDB === null) return;

		let data: Buffer = sDB.save_data;
		let count: number = data.byteLength;
		let i = 0;
		let needUpdate = false;

		for (i = 0; i < count; i++) {
			if (data[i] === packet.value[i]) continue;
			data[i] |= packet.value[i];
			needUpdate = true;
		}

		if (!needUpdate) return

		sDB.save_data = data;

		let pData = new Net.SyncBuffered(packet.lobby, 'SyncSaveFile', data, true);
		this.ModLoader.serverSide.sendPacket(pData);

		this.ModLoader.logger.info('[Server] Updated: {Save File}');
	}

	@ServerNetworkHandler('SyncStarCount')
	onServer_SyncStarCount(packet: Net.SyncNumber) {
		this.ModLoader.logger.info('[Server] Received: {Star Count}');

		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

		// Safety check
		if (sDB === null) return;

		let data: number = sDB.star_count;

		if (data >= packet.value) return;

		sDB.star_count = packet.value;

		let pData = new Net.SyncNumber(packet.lobby, 'SyncStarCount', packet.value, true);
		this.ModLoader.serverSide.sendPacket(pData);

		this.ModLoader.logger.info('[Server] Updated: {Star Count}');
	}

	@ServerNetworkHandler('SyncScene')
	onServer_SyncScene(packet: Net.SyncNumber) {
		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

		// Safety check
		if (sDB === null) return;

		let pMsg = 'Player[' + packet.player.nickname + ']';
		let sMsg = 'Scene[' + packet.value + ']';
		sDB.players[packet.player.uuid] = packet.value;
		this.ModLoader.logger.info('[Server] Received: {Player Scene}');
		this.ModLoader.logger.info('[Server] Updated: ' + pMsg + ' to ' + sMsg);
	}

	@ServerNetworkHandler('SyncPuppet')
	onServer_SyncPuppet(packet: Net.SyncPuppet) {
		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

		// Safety check
		if (sDB === null || sDB.players === null) return

		Object.keys(sDB.players).forEach((key: string) => {
			if (sDB.players[key] !== sDB.players[packet.player.uuid]) {
				return;
			}

			if (!sDB.playerInstances.hasOwnProperty(key)) return;
			if (sDB.playerInstances[key].uuid === packet.player.uuid) {
				return;
			}

			this.ModLoader.serverSide.sendPacketToSpecificPlayer(
				packet,
				sDB.playerInstances[key]
			);
		});
	}

	// #################################################
	// ##  Client Receive Packets
	// #################################################

	@NetworkHandler('SyncStorage')
	onClient_SyncStorage(packet: Net.SyncStorage): void {
		this.ModLoader.logger.info('[Client] Received: {Lobby Storage}');
		this.cDB.save_data = packet.save_data;
		this.cDB.star_count = packet.star_count;
	}

	@NetworkHandler('SyncSaveFile')
	onClient_SyncSaveFile(packet: Net.SyncBuffered) {
		this.ModLoader.logger.info('[Client] Received: {Save File}');
		let data: Buffer = this.cDB.save_data;
		let count: number = data.byteLength;
		let i = 0;
		let needUpdate = false;
		for (i = 0; i < count; i++) {
			if (data[i] === packet.value[i]) continue;
			data[i] |= packet.value[i];
			needUpdate = true;
		}
		if (needUpdate) {
			this.cDB.save_data = data;
			this.ModLoader.logger.info('[Client] Updated: {Save File}');
		}
	}

	@NetworkHandler('SyncStarCount')
	onClient_SyncStarCount(packet: Net.SyncNumber) {
		this.ModLoader.logger.info('[Client] Received: {Star Count}');

		let data: number = this.cDB.star_count;

		if (data >= packet.value) return;

		this.cDB.star_count = packet.value;

		this.ModLoader.logger.info('[Client] Updated: {Star Count}');
	}

	@NetworkHandler('Request_Scene')
	onClient_RequestScene(packet: Packet) {
		let pData = new Net.SyncNumber(
			packet.lobby,
			"SyncScene",
			this.core.runtime.get_current_scene(),
			false
		);
		this.ModLoader.clientSide.sendPacketToSpecificPlayer(pData, packet.player);
	}

	@NetworkHandler('SyncScene')
	onClient_SyncScene(packet: Net.SyncNumber) {
		let pMsg = 'Player[' + packet.player.nickname + ']';
		let sMsg = 'Scene[' + packet.value + ']';
		this.pMgr.changePuppetScene(packet.player, packet.value);
		this.ModLoader.logger.info('[Client] Received: {Player Scene}');
		this.ModLoader.logger.info('[Client] Updated: ' + pMsg + ' to ' + sMsg);
	}

	@NetworkHandler('SyncPuppet')
	onClient_SyncPuppet(packet: Net.SyncPuppet) {
		this.pMgr.handlePuppet(packet);
	}
}