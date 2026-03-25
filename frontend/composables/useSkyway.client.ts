import type { LocalAudioStream, LocalSFURoomMember, RoomPublication } from '@skyway-sdk/room';
import { useCusEvent } from './useCusEvent';
import type { Socket } from 'socket.io-client';

export async function useConnectSkyway(gamerTag: string) {
  if (typeof window !== 'undefined' && !import.meta.env.SSR) {
    const {
      nowInSec,
      SkyWayAuthToken,
      SkyWayContext,
      SkyWayRoom,
      uuidV4,
      LocalAudioStream,
      RemoteAudioStream
    } = await import('@skyway-sdk/room');

    const { session } = useUserSession();

    const discordId = (session.value?.user as { discordId: string; discordAuth: boolean; gamerTag: string }).discordId;

    const { on, off, emit } = useCusEvent();
    const { $socket } = useNuxtApp();

    const {
      audioContext,
      micDest,
      phoneLevel,
      isSelfMute,
      isJoiningIngame,
      userList,
      nearbyUserList,
      playerData,
      adminSpeaker
    } = useComponents();

    // サーバーサイドから安全にSkyWay認証情報を取得
    const skywayConfig = await $fetch('/api/getSkywayToken');
    const appId = skywayConfig.appId as string;
    const secretKey = skywayConfig.secretKey as string;


    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      scope: {
        app: {
          id: appId,
          turn: true,
          actions: ['read'],
          channels: [
            {
              id: '*',
              name: '*',
              actions: ['write'],
              members: [
                {
                  id: '*',
                  name: '*',
                  actions: ['write'],
                  publication: {
                    actions: ['write'],
                  },
                  subscription: {
                    actions: ['write'],
                  },
                },
              ],

              sfuBots: [
                {
                  actions: ['write'],
                  forwardings: [
                    {
                      actions: ['write'],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }).encode(secretKey);

    const context = await SkyWayContext.Create(token);
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: 'sfu',
      name: 'test',
    });

    const spaceMorse = '....__..__._..';
    const joinName = gamerTag.replace(/ /g, spaceMorse);

    let me: LocalSFURoomMember;

    try {
      me = await room.join({ name: joinName });
    } catch (err) {
      throw 'joining_error';
    }

    if (micDest.value) {
      const { stream } = micDest.value
      const selfStream = new LocalAudioStream(stream.getTracks()[0]);

      await me.publish(selfStream, {
        maxSubscribers: 99
      });
    }

    // ユーザーごとのハンドラ（クロージャで状態を閉じ込める）
    interface MemberHandler {
      publication: RoomPublication;
      handleCycle: (shouldSubscribe: boolean) => Promise<void>;
      cleanup: () => void;
      remove: () => void;
    }

    const memberHandlers = new Map<string, MemberHandler>();
    let playerVolume = new Map<string, number>();
    let hasPhone = 0;
    let isMute = 0;
    let isProcessingDataCycle = false;

    on('debug', () => {
      const socket = $socket as Socket;
      const jpNowStr = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).format(new Date());

      const debugData = {
        timeStamp: jpNowStr,
        sendUser: joinName,
        nearbyUserList: nearbyUserList.value.map(user => ({
          gamerTag: user.gamerTag,
          gain: user.gain,
          voice: user.voice,
        })),
        memberHandlers: Array.from(memberHandlers.keys()),
        playerVolume: Array.from(playerVolume.entries()),
      }

      console.log(debugData);
      socket.emit('debug', debugData);
    })

    const addJoinMember = (publication: RoomPublication) => {
      const publisher = publication.publisher;
      const pubName = publisher.name!.replace(/....__..__._../g, ' ');

      if (publisher.id === me.id) return;

      // --- ユーザーごとのクロージャ状態 ---
      let isNearby = false;
      let subscribing = false;
      let sub: string | null = null;

      const gain = ref(Number(localStorage.getItem(pubName) || 1));

      // 全ユーザーリスト（UI表示用）に追加
      const joinUserInfo = reactive({
        gamerTag: pubName,
        gain: gain
      })
      userList.value.push(joinUserInfo);

      // userListのgain変更を nearbyUserList に同期
      watch(joinUserInfo, () => {
        const nearby = nearbyUserList.value.find(u => u.gamerTag === pubName);
        if (nearby) {
          nearby.gain = Number(joinUserInfo.gain);
        }
        localStorage.setItem(pubName, joinUserInfo.gain.toString());
      })

      const doSubscribe = async () => {
        if (subscribing || isNearby) return;
        subscribing = true;

        // AudioContextがsuspendedの場合はresumeする
        if (audioContext.value?.state === 'suspended') {
          await audioContext.value.resume();
        }

        let audioStream;
        let roomSubscription;
        try {
          const { stream, subscription } = await me.subscribe(publication.id);
          audioStream = stream;
          roomSubscription = subscription;
        } catch (err) {
          subscribing = false;
          return;
        }

        sub = roomSubscription.id;
        subscribing = false;

        if (!(audioStream instanceof RemoteAudioStream)) return;

        const newStream = new MediaStream([audioStream.track]);

        const tempAudio = new Audio();
        tempAudio.autoplay = true;
        tempAudio.muted = true;
        tempAudio.srcObject = newStream;

        const source = audioContext.value!.createMediaStreamSource(newStream);
        const gainNode = audioContext.value!.createGain();
        const destination = audioContext.value!.createMediaStreamDestination();
        const analyser = audioContext.value!.createAnalyser();
        analyser.fftSize = 256;

        const isVoiceDetected = ref<boolean>(false);
        let audioLevelActive = true;

        const checkAudioLevel = async () => {
          while (audioLevelActive) {
            const dataArray = new Uint8Array(analyser.fftSize);
            analyser.getByteTimeDomainData(dataArray);
            isVoiceDetected.value = dataArray.some(v => Math.abs(v - 128) > 1);
            await new Promise(r => setTimeout(r, 200));
          }
        }

        source.connect(gainNode);
        gainNode.connect(destination);
        gainNode.connect(analyser);
        checkAudioLevel();

        const newAudio = new Audio();
        newAudio.autoplay = true;
        newAudio.muted = false;
        newAudio.srcObject = destination.stream;

        const nearbyUserInfo = reactive({
          gamerTag: pubName,
          gain: gain,
          voice: isVoiceDetected,
          source,
          gainNode,
          destination,
          analyser,
          audio: newAudio,
          stopAudioLevel: () => { audioLevelActive = false; }
        })
        nearbyUserList.value.push(nearbyUserInfo);
        isNearby = true;

        // nearbyUserListのgain変更をuserListに同期
        watch(() => nearbyUserInfo.gain, (newGain) => {
          const u = userList.value.find(u => u.gamerTag === pubName);
          if (u) u.gain = Number(newGain);
          localStorage.setItem(pubName, newGain.toString());
        })

        // 距離ベースのgain計算
        const changeGain = computed(() => {
          let vol = 0;
          if (playerVolume.get(pubName) != undefined) vol = playerVolume.get(pubName)!;
          if (adminSpeaker.value.has(pubName)) vol = 1;
          return 2 * nearbyUserInfo.gain * vol * (phoneLevel.value / 100);
        })

        gainNode.gain.value = changeGain.value;
        watch(changeGain, () => {
          gainNode.gain.value = changeGain.value;
        })
      }

      const doUnsubscribe = async () => {
        if (!isNearby || !sub) return;

        try {
          await me.unsubscribe(sub);
        } catch (err) {
          console.log("unsubscribe error", err);
        }

        doCleanup();
      }

      const doCleanup = () => {
        const index = nearbyUserList.value.findIndex(u => u.gamerTag === pubName);
        if (index > -1) {
          const info = nearbyUserList.value[index];
          info.stopAudioLevel();
          info.audio.pause();
          info.audio.srcObject = null;
          info.source.disconnect();
          info.gainNode.disconnect();
          info.analyser.disconnect();
          info.destination.stream.getTracks().forEach(t => t.stop());
          nearbyUserList.value.splice(index, 1);
        }
        sub = null;
        isNearby = false;
      }

      const handleCycle = async (shouldSubscribe: boolean) => {
        if (shouldSubscribe) {
          if (!isNearby && !subscribing) {
            await doSubscribe();
          }
        } else {
          if (isNearby) {
            await doUnsubscribe();
          }
        }
      }

      const remove = () => {
        doCleanup();
        const index = userList.value.findIndex(u => u.gamerTag === pubName);
        if (index > -1) {
          userList.value.splice(index, 1);
        }
      }

      memberHandlers.set(pubName, {
        publication,
        handleCycle,
        cleanup: doCleanup,
        remove,
      });
    }

    on('dataCycle', async () => {
      if (!playerData.value) return;
      if (isProcessingDataCycle) return;
      isProcessingDataCycle = true;

      try {
        const selfData = getSelfData(gamerTag);

        if (selfData) {
          isJoiningIngame.value = true;

          // スマホ所持確認
          if (hasPhone != selfData.hasTelephone) {
            if (hasPhone == 0) {
              $fetch(`/api/setPhoneRole?id=${discordId}`)
            } else {
              $fetch(`/api/removePhoneRole?id=${discordId}`)
            }
          }
          hasPhone = selfData.hasTelephone;

          // ミュート確認
          if (selfData.mute != 0 && selfData.mute != isMute) {
            emit('mute', selfData.mute);
          }
          isMute = selfData.mute;

          // 距離による音量計算
          const distanceData = getDistance(selfData);
          playerVolume = calcPlayerVolume(selfData, distanceData);

          const promises: Promise<void>[] = [];
          memberHandlers.forEach((handler, name) => {
            const shouldSubscribe =
              adminSpeaker.value.has(name) || (playerVolume.get(name) ?? 0) > 0;
            promises.push(handler.handleCycle(shouldSubscribe));
          })
          await Promise.all(promises);
        } else {
          isJoiningIngame.value = false;

          const promises: Promise<void>[] = [];
          memberHandlers.forEach((handler, name) => {
            const shouldSubscribe = adminSpeaker.value.has(name);
            promises.push(handler.handleCycle(shouldSubscribe));
          })
          await Promise.all(promises);
        }
      } finally {
        isProcessingDataCycle = false;
      }
    })

    on('exit', async () => {
      memberHandlers.forEach(handler => handler.cleanup());
      memberHandlers.clear();
      userList.value.splice(0);
      nearbyUserList.value.splice(0);

      room.onStreamPublished.removeAllListeners();
      room.onMemberLeft.removeAllListeners();

      off('dataCycle');
      off('exit');

      await me.leave();
    })

    const leftMemberDettach = (name: string) => {
      const pubName = name.replace(/....__..__._../g, ' ');
      const handler = memberHandlers.get(pubName);
      if (handler) {
        handler.remove();
        memberHandlers.delete(pubName);
      }
    }

    room.publications.forEach(addJoinMember);
    room.onStreamPublished.add(async (e) => addJoinMember(e.publication));
    room.onMemberLeft.add(async (e) => leftMemberDettach(e.member.name!));
  }

  const getSelfData = (selfName: string) => {
    const { playerData } = useComponents();

    if (!playerData.value || !Array.isArray(playerData.value)) return undefined;
    return playerData.value.find(player => player.name == selfName);
  }

  const getDistance = (selfData: playerData) => {
    const { playerData } = useComponents();
    const distanceMap = new Map<string, number>();

    playerData.value.forEach((data, index) => {
      if (!selfData || data.name == selfData.name) return;

      const distance = Math.sqrt(Math.pow((selfData.x - data.x), 2) + Math.pow((selfData.y - data.y), 2) + Math.pow((selfData.z - data.z), 2));
      distanceMap.set(data.name, distance);
    })

    return distanceMap;
  }

  const calcPlayerVolume = (selfData: playerData, distanceData: Map<string, number>) => {

    const {
      ingameSettings,
      playerData
    } = useComponents();

    const playerVolume = new Map<string, number>();

    let min: number;
    let max: number;
    let coef = 1;
    let range = 1;
    let volume = 1;
    let distanceVolume = 0;

    const option = ingameSettings.value!;

    const calc = (oppName: string) => {
      const oppData = playerData.value.find(player => player.name == oppName)!;
      const oppDistance = distanceData.get(oppName)!;

      if (oppName)

        if (oppData == undefined || selfData == undefined) return 0;

      if (selfData.telephone + oppData.telephone == 0) coef = 1;
      else if ((selfData.telephone == oppData.telephone)) return 1;
      else if ((selfData.telephone != oppData.telephone)) coef = option.general.value.callingVolume.value;

      if (selfData.transceiverNumber >= 1 && oppData.transceiverNumber >= 1) {
        if (oppData.transceiverType === 1 && oppData.transceiverNumber == selfData.transceiverNumber &&
          (selfData.transceiverType === 0 || selfData.transceiverType === 1)) {
          return 1;
        }
      }

      if (selfData.dimension != oppData.dimension) return 0;

      if (oppData.useMicrophone) {
        coef = option.microphone.value.volumeGain.value;
        min = option.microphone.value.minDistance.value;
        max = option.microphone.value.maxDistance.value;
      } else if (oppData.useMegaphone) {
        coef = option.megaphone.value.volumeGain.value;
        min = option.megaphone.value.minDistance.value;
        max = option.megaphone.value.maxDistance.value;
      } else {
        min = option.general.value.minDistance.value;
        max = option.general.value.maxDistance.value;
      }

      range = (oppData.voiceRangeOutput / 100) * (selfData.voiceRangeInput / 100);
      volume = (oppData.volumeOutput / 100) * (selfData.volumeInput / 100);

      max *= range;
      min *= range;

      if (oppDistance <= min) distanceVolume = 1;
      else if (oppDistance >= max) distanceVolume = option.general.value.minVolume.value;
      else distanceVolume = (1 - (oppDistance - min) / (max - min));

      return distanceVolume * coef * volume;
    }

    playerData.value.forEach(player => {
      if (selfData == undefined) {
        playerVolume.set(player.name, 0);
        return;
      }
      if (player.name == selfData.name) return;

      playerVolume.set(player.name, calc(player.name));
    })

    return playerVolume;
  }
}
