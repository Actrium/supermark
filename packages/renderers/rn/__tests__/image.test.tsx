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

/** Finds the image-gallery viewport that owns the directional pan responder. */
function findImageGallery(renderer: ReactTestRenderer): ReactTestRenderer['root'] {
  return renderer.root
    .findAllByType('View')
    .find(view => typeof view.props.onMoveShouldSetPanResponder === 'function')!;
}

/** Finds the single-row view that measures and lays out gallery images. */
function findImageGalleryTrack(renderer: ReactTestRenderer): ReactTestRenderer['root'] {
  return renderer.root
    .findAllByType('View')
    .find(view => view.props.style?.flexDirection === 'row')!;
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
    expect(renderer.root.findAllByType('ScrollView')).toHaveLength(0);
    expect(renderer.root.findAllByType('AnimatedView')).toHaveLength(0);
    expect(renderer.root.findAllByType('Text')).toHaveLength(0);
  });

  it('allows the host to override the stable block-image container dimensions', async () => {
    const renderer = await renderAst(
      imageAst([{ type: 'image', url: 'https://example.com/photo.jpg', alt: 'photo' }]),
      { imageContainer: { width: 320, height: 180 } }
    );

    const image = renderer.root.findByType('Image');
    expect(image.parent?.props.style).toMatchObject({ width: 320, height: 180 });
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
      imageAst([
        { type: 'image', url: 'https://example.com/a.jpg', alt: 'a' },
        { type: 'image', url: 'https://example.com/b.jpg', alt: 'b' },
      ]),
      {
        imageGallery: { gap: 12 },
        imageContainer: { height: 180, borderRadius: 16 },
      }
    );

    const image = renderer.root.findAllByType('Image')[0];
    expect(findImageGallery(renderer).props.style).toMatchObject({ height: 180 });
    expect(findImageGalleryTrack(renderer).props.style).toMatchObject({ gap: 12 });
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
    expect(renderer.root.findAllByType('ScrollView')).toHaveLength(0);
    expect(gallery.props.style).toMatchObject({ height: 200, overflow: 'hidden' });
    expect(findImageGalleryTrack(renderer).props.style).toMatchObject({
      flexDirection: 'row',
      gap: 8,
      alignSelf: 'flex-start',
      flexShrink: 0,
    });
  });

  it('claims horizontal drags but leaves vertical drags to the outer list', async () => {
    const renderer = await renderAst(
      imageAst([
        { type: 'image', url: 'https://example.com/a.jpg', alt: 'a' },
        { type: 'image', url: 'https://example.com/b.jpg', alt: 'b' },
      ])
    );

    const shouldClaim = findImageGallery(renderer).props.onMoveShouldSetPanResponder;
    expect(shouldClaim({}, { dx: 20, dy: 4 })).toBe(true);
    expect(shouldClaim({}, { dx: 4, dy: 20 })).toBe(false);
    expect(shouldClaim({}, { dx: 3, dy: 1 })).toBe(false);
    expect(findImageGallery(renderer).props.onPanResponderTerminationRequest()).toBe(false);
  });

  it('clamps horizontal dragging to the measured image-track boundaries', async () => {
    const renderer = await renderAst(
      imageAst([
        { type: 'image', url: 'https://example.com/a.jpg', alt: 'a' },
        { type: 'image', url: 'https://example.com/b.jpg', alt: 'b' },
      ])
    );

    const gallery = findImageGallery(renderer);
    const animatedTrack = renderer.root.findByType('AnimatedView');
    const contentTrack = findImageGalleryTrack(renderer);
    // A 408px track inside a 300px viewport can move at most 108px to the left.
    gallery.props.onLayout({ nativeEvent: { layout: { width: 300 } } });
    contentTrack.props.onLayout({ nativeEvent: { layout: { width: 408 } } });
    gallery.props.onPanResponderGrant();
    gallery.props.onPanResponderMove({}, { dx: -500, dy: 0 });
    expect(animatedTrack.props.style.transform[0].translateX.value).toBe(-108);

    // A new drag back to the right must stop at the track's zero offset.
    gallery.props.onPanResponderGrant();
    gallery.props.onPanResponderMove({}, { dx: 500, dy: 0 });
    expect(animatedTrack.props.style.transform[0].translateX.value).toBe(0);
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
