import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Favicon } from './Favicon'

describe('收藏卡片 favicon', () => {
  it('用 _favicon 端点加载图标(本地缓存,不用网络图标服务)', () => {
    const { container } = render(<Favicon pageUrl="https://github.com" title="GitHub" fallbackColor="#3b82f6" />)

    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe(
      'chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fgithub.com&size=32',
    )
  })

  it('加载失败(onerror)回退首字母色块', () => {
    const { container } = render(<Favicon pageUrl="https://github.com" title="GitHub" fallbackColor="#e99695" />)

    fireEvent.error(container.querySelector('img')!)

    const tile = container.querySelector('.favicon-tile')
    expect(tile?.textContent).toBe('G')
    expect(tile).toHaveStyle({ backgroundColor: '#e99695' })
    expect(container.querySelector('img')).toBeNull()
  })

  it('加载“成功”但 naturalWidth 为 0(默认图)同样回退首字母色块', () => {
    const { container } = render(<Favicon pageUrl="https://github.com" title="GitHub" fallbackColor="#e99695" />)

    const img = container.querySelector('img')!
    Object.defineProperty(img, 'naturalWidth', { value: 0 })
    fireEvent.load(img)

    expect(container.querySelector('.favicon-tile')?.textContent).toBe('G')
  })
})
