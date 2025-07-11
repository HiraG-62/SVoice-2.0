import type { LocalAudioStream, LocalSFURoomMember, RoomPublication } from '@skyway-sdk/room';
import { useCusEvent } from './useCusEvent';
import type { WatchHandle } from 'vue';

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

    const config = useRuntimeConfig();
    const appId = config.public.skywayAppId as string;
    const secretKey = config.public.skywaySecretKey as string;


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

    const subscribeMap = new Map<string, { pub: RoomPublication, sub: string }>();
    const gainMap = new Map<string, Ref<number>>();
    const watchMap = new Map<string, WatchHandle>();
    let playerVolume = new Map<string, number>();
    let hasPhone = 0;
    let isMute = 0;

    const addJoinMember = async (publication: RoomPublication) => {
      const publisher = publication.publisher;
      const pubName = publisher.name!.replace(/....__..__._../g, ' ');

      if (publisher.id === me.id) return;

      subscribeMap.set(pubName, { pub: publication, sub: '' });

      const gain = Number(localStorage.getItem(pubName) || 1);

      const userInfo = reactive({
        gamerTag: pubName,
        gain: ref(gain)
      })

      userList.value.push(userInfo);

      watch(userInfo, (newInfo) => {
        const isNearby = nearbyUserList.value.find(user => user.gamerTag == pubName);
        if(isNearby) {
          isNearby.gain = Number(userInfo.gain);
        }
        localStorage.setItem(pubName, userInfo.gain.toString());
      })
    }

    const subscribeAttach = async (publication: RoomPublication) => {

      const publisher = publication.publisher;
      const pubName = publisher.name!.replace(/....__..__._../g, ' ');

      if (publisher.id === me.id) return;

      const { stream, subscription } = await me.subscribe(publication.id);
      subscribeMap.set(pubName, { pub: publication, sub: subscription.id });

      if (!(stream instanceof RemoteAudioStream)) return;

      const newStream = new MediaStream([stream.track]);

      const tempAudio = new Audio();
      tempAudio.controls = true;
      tempAudio.autoplay = true;
      tempAudio.muted = true;
      tempAudio.srcObject = newStream;

      const source = audioContext.value!.createMediaStreamSource(newStream);
      const gainNode = audioContext.value!.createGain();
      const destination = audioContext.value!.createMediaStreamDestination();
      const analyser = audioContext.value!.createAnalyser();
      let animationFrameId: number;
      analyser.fftSize = 256;

      const isVoiceDetected = ref<boolean>(false);

      const checkAudioLevel = async () => {
        if (analyser) {
          const bufferLength = analyser.fftSize;
          const dataArray = new Uint8Array(bufferLength);
          analyser.getByteTimeDomainData(dataArray);

          // 振幅が変化しているかをチェック
          const isDetected = dataArray.some(value => Math.abs(value - 128) > 1); // 128は無音状態
          isVoiceDetected.value = isDetected;

          await new Promise((resolve) => setTimeout(resolve, 200));

          checkAudioLevel();
        }
      }

      source.connect(gainNode);
      gainNode.connect(destination);
      gainNode.connect(analyser);

      checkAudioLevel();

      const newAudio = new Audio();
      newAudio.controls = true;
      newAudio.autoplay = true;
      newAudio.muted = false;
      newAudio.srcObject = destination.stream;

      const gain = ref(Number(localStorage.getItem(pubName) || 1));

      gainMap.set(pubName, gain);

      const userInfo = reactive({
        gamerTag: pubName,
        gain: gain,
        voice: isVoiceDetected,
        source,
        gainNode,
        destination,
        analyser,
        audio: newAudio
      })
      nearbyUserList.value.push(userInfo);

      const changeGain = computed(() => {
        if (playerData.value) {
          const oppData = playerData.value.find(player => player.name == pubName)!;
        }
        let volume = 0;
        if (playerVolume.get(pubName) != undefined) volume = playerVolume.get(pubName)!;
        if (adminSpeaker.value.has(pubName)) volume = 1;

        return 2 * userInfo.gain * volume * (phoneLevel.value / 100);
      })

      gainNode.gain.value = changeGain.value

      watch(changeGain, (newInfo) => {
        gainNode.gain.value = changeGain.value;
        localStorage.setItem(pubName, gain.value.toString());
      })
    }

    gainMap.forEach((user, key) => {
      const w = watch(user, (newGain) => {
        const u = userList.value.find(user => user.gamerTag == key);
        u!.gain = user.value;
        localStorage.setItem(key, user.value.toString());
      });

      watchMap.set(key, w);
    })

    on('dataCycle', async () => {
      if (!playerData.value) return;
      const selfData = getSelfData(gamerTag);

      if (selfData) {
        isJoiningIngame.value = true;

        if (hasPhone != selfData.hasTelephone) {
          if (hasPhone == 0) {
            $fetch(`${config.public.server.api.sslurl}/setPhoneRole?id=${discordId}`)
          } else {
            $fetch(`${config.public.server.api.sslurl}/removePhoneRole?id=${discordId}`)
          }
        }
        hasPhone = selfData.hasTelephone;

        if(selfData.mute != 0 && selfData.mute != isMute) {
          emit('mute', selfData.mute);
        }
        isMute = selfData.mute;

        const distanceData = getDistance(selfData);
        playerVolume = calcPlayerVolume(selfData, distanceData);
        subscribeMap.forEach(async (member, name) => {
          try {
            const shouldSubscribe =
              adminSpeaker.value.has(name) || (playerVolume.get(name) ?? 0) > 0;

            if (shouldSubscribe) {
              if (!me.subscriptions.some(sub => sub.id === member.sub!) &&
                room.publications.includes(member.pub!)) {
                subscribeAttach(member.pub!).catch((err) => {});
              }
            } else if (me.subscriptions.some(sub => sub.id === member.sub!) && playerVolume.get(name)! == 0) {
              await me.unsubscribe(member.sub!).catch((err) => {});
              watchMap.get(name);
              unsubscribeCleanup(name);
            }
          } catch (err) {
          }
        })
      } else {
        isJoiningIngame.value = false;

        subscribeMap.forEach(async (member, name) => {
          try {
            if (adminSpeaker.value.has(name)) {
              if (!me.subscriptions.find(sub => sub.id == member.sub!) &&
                room.publications.find(pub => pub == member.pub!)) {
                subscribeAttach(member.pub!).catch((err) => {});
              }
            } else {
              if (me.subscriptions.find(sub => sub.id == member.sub!)) {
                me.unsubscribe(member.sub!).catch((err) => {});
                unsubscribeCleanup(name);
              }
            }
          } catch (err) {
            console.log(err);
          }
        })
      }
    })

    on('exit', async () => {
      subscribeMap.forEach((e, key) => unsubscribeCleanup(key));
      subscribeMap.clear();
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
      const index = userList.value.findIndex(user => user.gamerTag === name);
      userList.value.splice(index, 1);

      unsubscribeCleanup(pubName);
    }

    const unsubscribeCleanup = (name: string) => {
      const index = nearbyUserList.value.findIndex(user => user.gamerTag === name);
      if (index > -1) {
        const userInfo = nearbyUserList.value[index];

        // Audioオブジェクトの再生停止とリソース解放
        userInfo.audio.pause();
        userInfo.audio.srcObject = null;

        // オーディオ関連オブジェクトの接続解除とリソース解放
        userInfo.source.disconnect();
        userInfo.gainNode.disconnect();
        userInfo.analyser.disconnect();
        userInfo.destination.stream.getTracks().forEach(track => track.stop());

        subscribeMap.get(name)!.sub = '';
        nearbyUserList.value.splice(index, 1);
      }
    }

    room.publications.forEach(addJoinMember);
    room.onStreamPublished.add(async (e) => addJoinMember(e.publication));
    room.onMemberLeft.add(async (e) => leftMemberDettach(e.member.name!));
  }

  const getSelfData = (selfName: string) => {
    const { playerData } = useComponents();

    const self = playerData.value.find(player => player.name == selfName)!;
    return self;
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
