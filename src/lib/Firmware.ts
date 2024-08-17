export class Firmware {
  compatible: string[]

  constructor(compatible: string[]) {
    this.compatible = compatible;
  }

  getCompatible(): string[] {
    return this.compatible || [];
  }
}
