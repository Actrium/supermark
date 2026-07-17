declare module 'react-native/Libraries/Text/TextAncestor' {
  import type React from 'react';

  const TextAncestor: React.Context<boolean>;

  export default TextAncestor;
}

declare module 'react-native/Libraries/Types/CodegenTypes' {
  import type { NativeSyntheticEvent } from 'react-native';
  import type { EventSubscription } from 'react-native/Libraries/vendor/emitter/EventEmitter';

  export type BubblingEventHandler<
    T,
    PaperName extends string | never = never,
  > = ((event: NativeSyntheticEvent<T>) => void | Promise<void>) & {
    readonly __paperName?: PaperName;
  };
  export type DirectEventHandler<
    T,
    PaperName extends string | never = never,
  > = ((event: NativeSyntheticEvent<T>) => void | Promise<void>) & {
    readonly __paperName?: PaperName;
  };

  export type Double = number;
  export type Float = number;
  export type Int32 = number;
  export type UnsafeObject = object;
  export type UnsafeMixed = unknown;

  type DefaultTypes = number | boolean | string | ReadonlyArray<string>;

  export type WithDefault<
    Type extends DefaultTypes,
    Value extends Type | string | undefined | null,
  > = Type | Value | undefined | null;

  export type EventEmitter<T> = (
    handler: (arg: T) => void | Promise<void>
  ) => EventSubscription;
}
