import {Camera} from "@/lib/Camera";
import {Firmware} from "@/lib/Firmware";

export const getCameras = async (): Promise<Record<string, Camera>> => {
  const camerasResponse = await fetch('https://raw.githubusercontent.com/DeathCamel58/amcrest-compatible-finder/master/cameras.json');
  const camerasData = await camerasResponse.json();

  const cameraRecords: Record<string, Camera> = {};

  Object.entries(camerasData).forEach(([key, value]) => {
    const cameraInfo = value as { camera_name: string[], notes: string[], url: string };
    cameraRecords[key] = new Camera(cameraInfo.camera_name, cameraInfo.notes, cameraInfo.url);
  });

  return cameraRecords;
};

export const getFirmwares = async (): Promise<Record<string, Firmware>> => {
  const firmwareResponse = await fetch('https://raw.githubusercontent.com/DeathCamel58/amcrest-compatible-finder/master/firmware_compatible.json');
  const firmwareData = await firmwareResponse.json();

  const firmwareRecords: Record<string, Firmware> = {};

  Object.entries(firmwareData).forEach(([key, value]) => {
    firmwareRecords[key] = new Firmware(value as string[]);
  });

  return firmwareRecords;
};
