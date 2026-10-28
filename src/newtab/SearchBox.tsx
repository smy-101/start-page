type SearchBoxProps = {
  query: string
  onChange: (query: string) => void
  onSearch: (query: string) => void
}

/** 搜索框(初始页顶部):输入即过滤收藏;回车用默认搜索引擎在新标签页搜索输入词。 */
export function SearchBox({ query, onChange, onSearch }: SearchBoxProps) {
  return (
    <input
      className="search-input"
      type="search"
      aria-label="搜索收藏"
      placeholder="搜索标题、网址或备注,回车搜索网页"
      value={query}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSearch(event.currentTarget.value)
      }}
    />
  )
}
