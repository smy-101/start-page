import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { createMemoryStorage } from '../storage/memoryStorage'

// 折叠状态走 localStorage 侧通道,测试间清空避免串扰
beforeEach(() => {
  localStorage.clear()
})

async function renderApp() {
  render(<App adapter={createMemoryStorage()} />)
  await screen.findByRole('heading', { name: '收集箱' })
}

describe('分组管理:新建分组', () => {
  it('填名字选颜色提交后,新分组分区出现;空名被拒并给出中文提示', async () => {
    await renderApp()

    fireEvent.change(screen.getByLabelText('分组名'), { target: { value: '工作' } })
    fireEvent.click(screen.getByRole('radio', { name: '颜色 #e99695' }))
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }))

    expect(await screen.findByRole('heading', { name: '工作' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('分组名'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }))
    expect(await screen.findByText('分组名不能为空')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)
  })
})
