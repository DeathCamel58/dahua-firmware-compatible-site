export class Camera {
  cameraName: string[];
  notes: string[];
  url: string;

  constructor(cameraName: string[], notes: string[], url: string) {
    this.cameraName = cameraName;
    this.notes = notes;
    this.url = url;
  }

  getCameraName(): string[] {
    return this.cameraName;
  }

  getNotes(): string[] {
    return this.notes;
  }

  getUrl(): string {
    return this.url;
  }
}
