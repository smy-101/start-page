type GroupSectionProps = {
  name: string
}

/** 分组分区:收藏网格的容器。收集箱是保留分组,空状态提示收藏尚不存在。 */
export function GroupSection({ name }: GroupSectionProps) {
  return (
    <section className="group" aria-label={name}>
      <h2 className="group-name">{name}</h2>
      <p className="group-empty">还没有收藏</p>
    </section>
  )
}
