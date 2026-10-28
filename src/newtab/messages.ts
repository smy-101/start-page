import type { DomainErrorCode } from '../domain/types'

/** 领域错误码 → 中文提示。 */
export const domainErrorText: Record<DomainErrorCode, string> = {
  'invalid-url': '网址无效,请输入完整网址',
  'duplicate-url': '该网址已在收藏中',
  'bookmark-not-found': '该收藏已不存在',
  'group-not-found': '分组已不存在',
  'empty-group-name': '分组名不能为空',
  'empty-group-color': '请为分组选择颜色',
}
