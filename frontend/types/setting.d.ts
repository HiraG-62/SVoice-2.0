interface VolumeSetting {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
};

interface ingameSettings {
  general: {
    value: {
      minVolume: VolumeSetting;
      minDistance: VolumeSetting;
      maxDistance: VolumeSetting;
      callingVolume: VolumeSetting;
    };
    label: string;
  };
  microphone: {
    value: {
      volumeGain: VolumeSetting;
      minDistance: VolumeSetting;
      maxDistance: VolumeSetting;
    };
    label: string;
  };
  megaphone: {
    value: {
      volumeGain: VolumeSetting;
      minDistance: VolumeSetting;
      maxDistance: VolumeSetting;
    };
    label: string;
  };
};