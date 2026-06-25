declare module 'gm' {
  interface GM {
    density(w: number, h: number): GM;
    background(color: string): GM;
    flatten(): GM;
    toBuffer(format: string, cb: (err: Error | null, buffer: Buffer) => void): void;
  }

  interface GMFactory {
    (src: string): GM;
    subClass(options: { imageMagick?: boolean }): GMFactory;
  }

  const gm: GMFactory;
  export default gm;
}
