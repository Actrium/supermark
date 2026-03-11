/**
 * 每个 engine 的 WebView bridge 需要提供的配置。
 *
 * DiagramWebViewBridge 在初始化时将所有已注册 engine 的 CDN 脚本
 * 合并到同一个 HTML 模板中，收到 render 消息后根据 engine 字段
 * 路由到对应的 handleRender 实现。
 */
export interface BridgeEngine {
  /** engine 标识，与 diagram-engine 中的 engine 名一致 */
  readonly name: string;

  /**
   * 需要在 WebView 中加载的 CDN 脚本 URL 列表。
   * 会被注入为 `<script src="..."></script>` 标签。
   */
  readonly cdnScripts: readonly string[];

  /**
   * WebView 内的渲染函数体（纯 JS 字符串）。
   *
   * 函数签名固定为：
   *   function(msg, send)
   *     msg  — { id, engine, code, options }
   *     send — function(resultObj) 用于回传结果
   *
   * 实现需要调用 send({ type:'result', id, success, format?, payload?, error? })
   */
  readonly handleRenderJs: string;
}
