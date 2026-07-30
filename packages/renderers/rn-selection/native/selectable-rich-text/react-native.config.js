module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: 'android',
        // libraryName must match the react_codegen_* target suffix in common/cpp/CMakeLists.txt.
        libraryName: 'RNSelectableTextSpec',
        // componentDescriptors tells Android autolinking to register the hand-written
        // Paragraph-compatible descriptor.
        componentDescriptors: ['SelectableRichTextComponentDescriptor'],
        // cmakeListsPath points at the C++ renderer component shipped with this package, to avoid
        // generating a plain View descriptor.
        cmakeListsPath: '../common/cpp/CMakeLists.txt',
      },
    },
  },
};
