module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: 'android',
        // libraryName 必须和 common/cpp/CMakeLists.txt 里的 react_codegen_* target 后缀一致。
        libraryName: 'RNSelectableTextSpec',
        // componentDescriptors 告诉 Android autolinking 注册手写 Paragraph 兼容 descriptor。
        componentDescriptors: ['SelectableRichTextComponentDescriptor'],
        // cmakeListsPath 指向随包提供的 C++ renderer component，避免生成普通 View descriptor。
        cmakeListsPath: '../common/cpp/CMakeLists.txt',
      },
    },
  },
};
