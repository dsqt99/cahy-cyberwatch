import type { ChannelType, NewsTopic } from './types'

export const NEWS_TOPICS: NewsTopic[] = [
  {
    id: 'kinh-te',
    label: 'Kinh tế',
    keywords: ['kinh tế', 'môi trường', 'buôn lậu', 'thương mại điện tử', 'tham nhũng'],
  },
  {
    id: 'bieu-tinh',
    label: 'Hoạt động biểu tình, tụ tập đông người',
    keywords: ['biểu tình', 'tụ tập đông người', 'tuần hành', 'gây rối trật tự công cộng', 'kích động', 'tập trung đông người'],
  },
  {
    id: 'trat-tu-xa-hoi',
    label: 'Trật tự xã hội',
    keywords: ['trật tự xã hội', 'trộm cắp', 'cướp', 'cướp giật', 'cố ý gây thương tích', 'đánh nhau', 'gây rối', 'trật tự công cộng'],
  },
  {
    id: 'toi-pham-kgm',
    label: 'Hoạt động tội phạm trên không gian mạng',
    keywords: ['tội phạm mạng', 'lừa đảo qua mạng', 'lừa đảo trực tuyến', 'chiếm đoạt tài sản', 'giả mạo', 'không gian mạng', 'tội phạm công nghệ'],
  },
  {
    id: 'quan-ly-hanh-chinh',
    label: 'Quản lý hành chính về trật tự xã hội',
    keywords: ['quản lý hành chính', 'cư trú', 'tạm trú', 'tạm vắng', 'căn cước công dân', 'căn cước', 'định danh điện tử', 'hộ khẩu', 'vũ khí', 'vật liệu nổ'],
  },
  {
    id: 'ma-tuy',
    label: 'Ma tuý',
    keywords: ['ma tuý', 'ma túy', 'chất cấm', 'heroin', 'ketamine', 'ma tuý đá', 'tàng trữ trái phép', 'mua bán ma tuý', 'nghiện'],
  },
  {
    id: 'giao-thong',
    label: 'Giao thông đường bộ, đường sắt, đường thủy',
    keywords: ['giao thông', 'tai nạn giao thông', 'đường bộ', 'đường sắt', 'đường thủy', 'vi phạm giao thông', 'nồng độ cồn', 'tốc độ', 'ùn tắc'],
  },
  {
    id: 'pccc-cnch',
    label: 'PCCC & CNCH',
    keywords: ['phòng cháy', 'chữa cháy', 'PCCC', 'cứu nạn', 'cứu hộ', 'CNCH', 'hỏa hoạn', 'cháy nổ'],
  },
  {
    id: 'an-ninh',
    label: 'An ninh',
    keywords: ['an ninh', 'an ninh quốc gia', 'an ninh chính trị', 'phản động', 'chống phá', 'thế lực thù địch', 'gián điệp', 'khủng bố'],
  },
  {
    id: 'an-ninh-mang',
    label: 'An ninh mạng và PCTP công nghệ cao',
    keywords: ['an ninh mạng', 'công nghệ cao', 'tấn công mạng', 'dữ liệu cá nhân', 'bảo mật', 'hacker', 'mã độc', 'lộ lọt thông tin'],
  },
  {
    id: 'bao-ve-tre-em',
    label: 'Bảo vệ trẻ em trên KGM',
    keywords: ['bảo vệ trẻ em', 'trẻ em', 'xâm hại trẻ em', 'không gian mạng', 'bạo hành trẻ em', 'trẻ vị thành niên'],
  },
  {
    id: 'tu-tap-loi-keo',
    label: 'Tụ tập, lôi kéo, tổ chức đông người',
    keywords: ['lôi kéo', 'kích động', 'tổ chức', 'tụ tập', 'xúi giục', 'tập hợp lực lượng', 'đông người trái phép'],
  },
  {
    id: 'luc-luong-cand',
    label: 'Lực lượng CAND',
    keywords: ['công an nhân dân', 'CAND', 'lực lượng công an', 'chiến sĩ công an', 'cán bộ công an', 'công an tỉnh', 'công an xã'],
  },
  {
    id: 'moi-truong-atttp',
    label: 'Môi trường, an toàn thực phẩm',
    keywords: ['môi trường', 'an toàn thực phẩm', 'ô nhiễm', 'xả thải', 'thực phẩm bẩn', 'vệ sinh an toàn thực phẩm', 'rác thải', 'chất thải'],
  },
  {
    id: 'bao-ve-su-kien',
    label: 'Bảo vệ sự kiện',
    keywords: ['bảo vệ sự kiện', 'bảo vệ an ninh', 'sự kiện chính trị', 'lễ kỷ niệm', 'hội nghị', 'đại hội', 'bảo vệ đoàn'],
  },
  {
    id: 'sap-nhap-xa-phuong',
    label: 'Sáp nhập xã, phường',
    keywords: [
      'sáp nhập',
      'sáp nhập xã',
      'sáp nhập phường',
      'sáp nhập xã phường',
      'sắp xếp đơn vị hành chính',
      'đơn vị hành chính cấp xã',
      'địa giới hành chính',
      'hợp nhất xã',
      'hợp nhất phường',
      'tinh gọn bộ máy',
    ],
  },
  {
    id: 'ban-tin-tong-hop',
    label: 'Bản tin tổng hợp',
    keywords: ['bản tin', 'tổng hợp', 'tin tức', 'thông báo', 'thời sự'],
  },
]

export const newsTopicById = (id?: string): NewsTopic | undefined =>
  id ? NEWS_TOPICS.find((t) => t.id === id) : undefined

export const channelDbValue = (channel: ChannelType): string | null =>
  channel === 'all' ? null : channel === 'ANTT' ? 'ANTT' : 'PhanDong'

export const getStartDate = (timeRange: 'day' | 'week' | 'month' | 'year' | 'all'): Date | null => {
  if (timeRange === 'all') return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  switch (timeRange) {
    case 'day':
      break
    case 'week':
      d.setDate(d.getDate() - 6)
      break
    case 'month':
      d.setDate(d.getDate() - 29)
      break
    case 'year':
      d.setDate(d.getDate() - 364)
      break
  }
  return d
}

// Format Date -> "YYYY-MM-DDTHH:mm:ss" in LOCAL time (no UTC conversion).
export const toLocalTimestamp = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
