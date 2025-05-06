declare module 'node-shazam' {
  export class Shazam {
    constructor();
    recognise(data: Buffer): Promise<any>;
  }
}
