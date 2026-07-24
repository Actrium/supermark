function unavailable(): never {
  throw new Error('The CommonMark renderer harness receives the Rust parser AST explicitly');
}

export const parse = unavailable;
export const parseJson = unavailable;
