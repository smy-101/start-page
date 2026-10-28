import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('初始页空壳', () => {
  it('渲染收集箱分区,空状态给出中文提示', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '收集箱' })).toBeInTheDocument()
    expect(screen.getByText('还没有收藏')).toBeInTheDocument()
  })
})
