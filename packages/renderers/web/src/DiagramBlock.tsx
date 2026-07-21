import React from 'react';
import type { DiagramRenderResult } from '@supramark/engines';
import type { SupramarkClassNames } from './classNames';

interface DiagramBlockProps {
  classNames: SupramarkClassNames;
  code: string;
  engine: string;
  result?: DiagramRenderResult;
}

export const DiagramBlock: React.FC<DiagramBlockProps> = ({ classNames, code, engine, result }) => {
  if (!result) {
    return (
      <div
        data-supramark-diagram={engine}
        data-supramark-diagram-state="rendering"
        className={classNames.diagram}
      >
        <pre className={classNames.diagramPre}>
          <code className={classNames.diagramCode}>正在渲染图表（{engine}）…</code>
        </pre>
        {/* 代码回退：引擎结果到达前展示原始源码，避免占位符永久卡死且无内容可读。 */}
        <pre className={classNames.diagramPre}>
          <code className={classNames.diagramCode}>{code}</code>
        </pre>
      </div>
    );
  }

  if (!result.success || result.format !== 'svg') {
    const errorHeader = `[diagram engine="${engine}" 渲染失败]\n${result.error?.details || result.payload}\n\n`;

    return (
      <div data-supramark-diagram={engine} className={classNames.diagram}>
        <pre className={classNames.diagramPre}>
          <code className={classNames.diagramCode}>{errorHeader + code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      data-supramark-diagram={engine}
      data-supramark-diagram-rendered="svg"
      className={classNames.diagram}
      dangerouslySetInnerHTML={{ __html: result.payload }}
    />
  );
};
