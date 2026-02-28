declare module "pdf-parse-fork" {
  const parse: (buffer: Buffer) => Promise<{ text?: string }>;
  export default parse;
}
