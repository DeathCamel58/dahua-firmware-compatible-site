import camerasData from '../data/cameras.json';
import firmwareData from '../data/firmware_compatible.json';
import {Camera} from "@/lib/Camera";
import {Firmware} from "@/lib/Firmware";

export const getCameras = (): Record<string, Camera> => {
  const cameraRecords: Record<string, Camera> = {};

  Object.entries(camerasData).forEach(([key, value]) => {
    cameraRecords[key] = new Camera(value.camera_name, value.notes, value.url);
  });

  return cameraRecords;
};

export const getFirmwares = (): Record<string, Firmware> => {
  const firmwareRecords: Record<string, Firmware> = {};

  Object.entries(firmwareData).forEach(([key, value]) => {
    firmwareRecords[key] = new Firmware(value);
  });

  return firmwareRecords;
};
