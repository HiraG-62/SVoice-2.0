import { defineStore } from 'pinia';
import type { PlayerData } from '@svoice/shared';
import { MAX_PEER_GAIN } from '../services/constants';

export interface JoinUser { gamerTag: string; gain: number }
export interface NearbyUser extends JoinUser { voice: boolean; currentGain: number }
export type CallStatus = 'idle' | 'joining' | 'joined';

export const useCallStore = defineStore('call', {
  state: () => ({
    gamerTag: '', status: 'idle' as CallStatus, inGame: false, players: [] as PlayerData[],
    users: [] as JoinUser[], nearby: [] as NearbyUser[], speakers: [] as string[],
    speaking: false, error: '',
  }),
  actions: {
    identify(tag: string) { this.gamerTag = tag; },
    setStatus(status: CallStatus) { this.status = status; },
    setError(message: string) { this.error = message; },
    setPlayers(players: PlayerData[]) { this.players = players; this.inGame = players.some(p => p.name === this.gamerTag); },
    setSpeakers(tags: (string | null)[]) {
      this.speakers = tags.filter((tag): tag is string => tag !== null);
      this.speaking = this.speakers.includes(this.gamerTag);
    },
    addUser(gamerTag: string) {
      this.removeUser(gamerTag);
      const saved = localStorage.getItem(gamerTag);
      const gain = saved === null ? 1 : Math.max(0, Math.min(MAX_PEER_GAIN, Number(saved)));
      this.users.push({ gamerTag, gain: Number.isFinite(gain) ? gain : 1 });
    },
    setUserGain(gamerTag: string, value: number) {
      const gain = Math.max(0, Math.min(MAX_PEER_GAIN, Number(value) || 0));
      const user = this.users.find(u => u.gamerTag === gamerTag);
      const nearby = this.nearby.find(u => u.gamerTag === gamerTag);
      if (user) user.gain = gain;
      if (nearby) nearby.gain = gain;
      localStorage.setItem(gamerTag, String(gain));
    },
    setNearby(gamerTag: string, voice: boolean, currentGain: number) {
      const user = this.users.find(u => u.gamerTag === gamerTag);
      if (!user) return;
      const existing = this.nearby.find(u => u.gamerTag === gamerTag);
      if (existing) Object.assign(existing, { gain: user.gain, voice, currentGain });
      else this.nearby.push({ ...user, voice, currentGain });
    },
    removeNearby(tag: string) { this.nearby = this.nearby.filter(u => u.gamerTag !== tag); },
    removeUser(tag: string) { this.removeNearby(tag); this.users = this.users.filter(u => u.gamerTag !== tag); },
    reset() {
      this.status = 'idle'; this.inGame = false; this.players = []; this.users = [];
      this.nearby = []; this.speakers = []; this.speaking = false;
    },
  },
});
