import { describe, expect, it } from 'bun:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { SupramarkRootNode } from '@supramark/core';

import './support/mock-react-native';
import './support/mock-renderer';

// react-test-renderer needs the act environment to flush effects synchronously.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { Supramark } = await import('../src/Supramark');

/** Builds the canonical paragraph shape emitted by the Rust parser for an image. */
function imageAst(children: SupramarkRootNode['children'][number][]): SupramarkRootNode {
  return {
    type: 'root',
    ast_version: 2,
    diagnostics: [],
    children: [{ type: 'paragraph', children }],
  } as SupramarkRootNode;
}

/** Builds a document from explicit top-level nodes for consecutive-paragraph layout tests. */
function documentAst(children: SupramarkRootNode['children']): SupramarkRootNode {
  return { type: 'root', ast_version: 2, diagnostics: [], children };
}

/** Renders a pre-parsed AST and flushes the renderer's asynchronous document preparation. */
async function renderAst(
  ast: SupramarkRootNode,
  styles?: React.ComponentProps<typeof Supramark>['styles']
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = create(React.createElement(Supramark, { ast, markdown: '', styles }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer as unknown as ReactTestRenderer;
}

/** Finds the horizontal image-gallery scroll view. */
function findImageGallery(renderer: ReactTestRenderer): ReactTestRenderer['root'] {
  return renderer.root.findByType('ScrollView');
}

describe('image rendering', () => {
  it('renders a standalone image in a stable 200x200 container with cover sizing', async () => {
    const renderer = await renderAst(
      imageAst([{ type: 'image', url: 'https://example.com/photo.jpg', alt: 'photo' }])
    );

    const image = renderer.root.findByType('Image');
    expect(image.props.source).toEqual({ uri: 'https://example.com/photo.jpg' });
    expect(image.props.accessibilityLabel).toBe('photo');
    expect(image.props.style).toMatchObject({ width: '100%', height: '100%', resizeMode: 'cover' });
    expect(image.parent?.type).toBe('View');
    expect(image.parent?.props.style).toMatchObject({ width: 200, height: 200 });
    expect(image.parent?.props.style).toMatchObject({ borderRadius: 8, overflow: 'hidden' });
    expect(findImageGallery(renderer).props.style).toMatchObject({
      height: 200,
      flexGrow: 0,
      flexShrink: 0,
    });
    expect(renderer.root.findAllByType('Text')).toHaveLength(0);
  });

  it('allows the host to override the stable block-image container dimensions', async () => {
    const renderer = await renderAst(
      imageAst([{ type: 'image', url: 'https://example.com/photo.jpg', alt: 'photo' }]),
      { imageContainer: { width: 320, height: 180 } }
    );

    const image = renderer.root.findByType('Image');
    expect(image.parent?.props.style).toMatchObject({ width: 320, height: 180 });
    expect(findImageGallery(renderer).props.style).toMatchObject({ height: 180 });
  });

  it('allows the host to override block-image sizing from cover to contain', async () => {
    const renderer = await renderAst(
      imageAst([{ type: 'image', url: 'https://example.com/photo.jpg', alt: 'photo' }]),
      { image: { resizeMode: 'contain' } }
    );

    const image = renderer.root.findByType('Image');
    expect(image.props.style).toMatchObject({ resizeMode: 'contain' });
  });

  it('allows the host to override the gallery gap and image corner radius', async () => {
    const renderer = await renderAst(
      imageAst([{ type: 'image', url: 'https://example.com/photo.jpg', alt: 'photo' }]),
      { imageGallery: { gap: 12 }, imageContainer: { borderRadius: 16 } }
    );

    const image = renderer.root.findByType('Image');
    expect(findImageGallery(renderer).props.contentContainerStyle).toMatchObject({ gap: 12 });
    expect(image.parent?.props.style).toMatchObject({ borderRadius: 16 });
  });

  it('lays out multiple images from one image-only paragraph in a horizontally scrolling row', async () => {
    const renderer = await renderAst(
      imageAst([
        { type: 'image', url: 'https://example.com/a.jpg', alt: 'a' },
        { type: 'text', value: ' ' },
        { type: 'image', url: 'https://example.com/b.jpg', alt: 'b' },
      ])
    );

    const images = renderer.root.findAllByType('Image');
    const gallery = findImageGallery(renderer);
    expect(images).toHaveLength(2);
    expect(gallery.props.horizontal).toBe(true);
    expect(gallery.props.showsHorizontalScrollIndicator).toBe(false);
    expect(gallery.props.contentContainerStyle).toMatchObject({
      flexDirection: 'row',
      gap: 8,
    });
  });

  it('groups consecutive image-only paragraphs and stops before normal content', async () => {
    const renderer = await renderAst(
      documentAst([
        {
          type: 'paragraph',
          children: [{ type: 'image', url: 'https://example.com/a.jpg', alt: 'a' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'image', url: 'https://example.com/b.jpg', alt: 'b' }],
        },
        { type: 'paragraph', children: [{ type: 'text', value: 'after' }] },
      ])
    );

    const images = renderer.root.findAllByType('Image');
    const gallery = findImageGallery(renderer);
    expect(images).toHaveLength(2);
    expect(gallery.findAllByType('Image')).toHaveLength(2);
    expect(renderer.root.findAllByType('Text')).toHaveLength(1);
  });

  it('keeps an image mixed with text inline without changing the paragraph structure', async () => {
    const renderer = await renderAst(
      imageAst([
        { type: 'text', value: 'before ' },
        { type: 'image', url: 'https://example.com/icon.png', alt: 'icon' },
        { type: 'text', value: ' after' },
      ])
    );

    const image = renderer.root.findByType('Image');
    expect(image.parent?.type).toBe('Text');
    expect(image.props.style).toMatchObject({ width: 20, height: 20, resizeMode: 'cover' });
  });

  it('keeps a standalone linked image in the same stable block container', async () => {
    const renderer = await renderAst(
      imageAst([
        {
          type: 'link',
          url: 'https://example.com/article',
          children: [{ type: 'image', url: 'https://example.com/photo.jpg', alt: 'linked photo' }],
        },
      ])
    );

    const image = renderer.root.findByType('Image');
    expect(image.parent?.type).toBe('View');
    expect(image.parent?.props.style).toMatchObject({ width: 200, height: 200 });
    expect(image.parent?.parent?.type).toBe('TouchableOpacity');
    expect(typeof image.parent?.parent?.props.onPress).toBe('function');
  });
});
