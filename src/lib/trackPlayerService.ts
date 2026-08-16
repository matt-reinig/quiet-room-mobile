import TrackPlayer, { Event } from "react-native-track-player";

export function registerQuietRoomTrackPlayerService() {
  TrackPlayer.registerPlaybackService(() => async () => {
    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      void TrackPlayer.play();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      void TrackPlayer.pause();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      void TrackPlayer.stop();
    });
  });
}
