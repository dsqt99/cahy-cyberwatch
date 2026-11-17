import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  RefreshCw,
  Link2,
  Filter,
  RotateCcw,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Layers,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sourcesService, Source, typesService, SourceType, n8nFetch } from "@/lib/supabase";
import { getN8nWebhookBaseSync } from "@/lib/desktopBridge";
import {
  PARENT_SOURCE_IDS,
  getParentSourceName,
  getParentSourceIcon,
  getParentSourceColor,
} from "@/lib/parentSourceUtils";
import { toast } from "sonner";

const SourceManagement = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [parentSources, setParentSources] = useState<Source[]>([]);
  const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sources");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("all");
  const [selectedTypeId, setSelectedTypeId] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [manualArticleUrl, setManualArticleUrl] = useState("");
  const [isAddingArticle, setIsAddingArticle] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    link: "",
    parent_id: "",
    type_id: "",
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [fetchedSources, fetchedTypes] = await Promise.all([
        sourcesService.getAllSources(),
        typesService.getAllTypes(),
      ]);

      const pSources: Source[] = [];
      const cSources: Source[] = [];
      const parentIds: string[] = Object.values(PARENT_SOURCE_IDS);

      fetchedSources.forEach((source) => {
        if (
          parentIds.includes(source.id) ||
          (source.parent_id === null &&
            ["Báo", "Facebook", "Telegram", "Tiktok", "Facebook Phản động"].includes(
              source.name
            ))
        ) {
          pSources.push(source);
        } else {
          cSources.push(source);
        }
      });

      setSourceTypes(fetchedTypes);
      setParentSources(pSources);
      setSources(cSources);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Không thể tải danh sách nguồn.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleOpenDialog = (source?: Source) => {
    if (source) {
      setEditingSource(source);
      setFormData({
        name: source.name || "",
        link: source.link || "",
        parent_id: source.parent_id || "",
        type_id: source.type_id || "",
      });
    } else {
      setEditingSource(null);
      setFormData({
        name: "",
        link: "",
        parent_id: "",
        type_id: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.parent_id || !formData.type_id) {
      toast.error("Vui lòng nhập tên nguồn, chọn Nguồn cha và Loại nguồn.");
      return;
    }

    setIsLoading(true);
    try {
      if (editingSource) {
        const { error } = await sourcesService.updateSource(editingSource.id, {
          name: formData.name,
          link: formData.link,
          parent_id: formData.parent_id,
          type_id: formData.type_id,
        });
        if (error) throw error;
        toast.success("Đã cập nhật thông tin nguồn.");
      } else {
        const { error } = await sourcesService.addSource({
          name: formData.name,
          link: formData.link,
          parent_id: formData.parent_id,
          type_id: formData.type_id,
        });
        if (error) throw error;
        toast.success("Đã thêm nguồn giám sát mới.");
      }
      setIsDialogOpen(false);
      void fetchData();
    } catch (error) {
      console.error("Lỗi khi lưu nguồn:", error);
      toast.error("Không thể lưu thông tin nguồn.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Xác nhận xóa nguồn tin này khỏi danh mục giám sát?")) return;

    setIsLoading(true);
    try {
      const { error } = await sourcesService.deleteSource(id);
      if (error) throw error;
      toast.success("Đã xóa nguồn tin.");
      void fetchData();
    } catch (error) {
      console.error("Lỗi khi xóa nguồn:", error);
      toast.error("Không thể xóa nguồn tin.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddManualArticle = async () => {
    if (!manualArticleUrl.trim()) {
      toast.error("Vui lòng nhập đường dẫn bài viết.");
      return;
    }

    try {
      new URL(manualArticleUrl);
    } catch {
      toast.error("Đường dẫn không hợp lệ. Vui lòng nhập URL đầy đủ (http/https).");
      return;
    }

    setIsAddingArticle(true);
    try {
      const response = await n8nFetch(
        `${getN8nWebhookBaseSync()}add-link-to-pending-queue`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: manualArticleUrl }),
        }
      );

      if (!response.ok) {
        throw new Error("API request failed");
      }

      toast.success("Đã nạp bài viết vào hàng đợi thu thập n8n.");
      setManualArticleUrl("");
    } catch (error) {
      console.error("Lỗi khi thêm bài viết vào hàng đợi:", error);
      toast.error("Không thể gửi URL vào hàng đợi xử lý.");
    } finally {
      setIsAddingArticle(false);
    }
  };

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    selectedParentId !== "all" ||
    selectedTypeId !== "all";

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedParentId("all");
    setSelectedTypeId("all");
    setCurrentPage(1);
  };

  const filteredSources = useMemo(() => {
    return sources.filter((source) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        source.name?.toLowerCase().includes(term) ||
        source.link?.toLowerCase().includes(term);

      const matchesParent =
        selectedParentId === "all" || source.parent_id === selectedParentId;

      const matchesType =
        selectedTypeId === "all" || source.type_id === selectedTypeId;

      return matchesSearch && matchesParent && matchesType;
    });
  }, [sources, searchTerm, selectedParentId, selectedTypeId]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredSources.length /
        (pageSize === -1 ? filteredSources.length || 1 : pageSize)
    )
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedSources = useMemo(() => {
    if (pageSize === -1) return filteredSources;
    const start = (currentPage - 1) * pageSize;
    return filteredSources.slice(start, start + pageSize);
  }, [filteredSources, currentPage, pageSize]);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages
      );
    } else {
      pages.push(
        1,
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        totalPages
      );
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted p-1 rounded-lg h-9 mb-4">
          <TabsTrigger value="sources" className="text-xs rounded-md">
            Danh mục nguồn giám sát
          </TabsTrigger>
          <TabsTrigger value="manual-article" className="text-xs rounded-md">
            Nạp URL bài viết lẻ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="space-y-4 mt-0">
          {/* Filter and Action Bar */}
          <div className="surface-panel p-4 space-y-3.5">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="flex flex-1 flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <Input
                    placeholder="Tìm theo tên hoặc đường dẫn nguồn..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-9 pr-8 h-9 bg-background text-xs"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        setCurrentPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Xóa tìm kiếm"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                <div className="w-full sm:w-48">
                  <Select
                    value={selectedParentId}
                    onValueChange={(value) => {
                      setSelectedParentId(value);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full h-9 bg-background text-xs">
                      <SelectValue placeholder="Tất cả nền tảng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                          <span>Tất cả nền tảng</span>
                        </div>
                      </SelectItem>
                      {parentSources.map((parent) => {
                        const IconComp = getParentSourceIcon(parent.id) || Globe;
                        const colorClass = getParentSourceColor(parent.id);
                        return (
                          <SelectItem key={parent.id} value={parent.id}>
                            <div className="flex items-center gap-2">
                              <IconComp className={`h-3.5 w-3.5 ${colorClass}`} strokeWidth={1.75} />
                              <span>{parent.name}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-44">
                  <Select
                    value={selectedTypeId}
                    onValueChange={(value) => {
                      setSelectedTypeId(value);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full h-9 bg-background text-xs">
                      <SelectValue placeholder="Tất cả phân loại" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả phân loại</SelectItem>
                      {sourceTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetFilters}
                    className="text-muted-foreground hover:text-foreground h-9 px-2.5 text-xs gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Đặt lại</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchData()}
                  disabled={isLoading}
                  className="h-9 text-xs gap-1.5 tactile-press"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                    strokeWidth={1.75}
                  />
                  <span>Làm mới</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleOpenDialog()}
                  className="h-9 text-xs gap-1.5 tactile-press"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Thêm nguồn</span>
                </Button>
              </div>
            </div>

            {/* Quick Platform Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2.5 border-t border-border">
              <span className="text-[11px] font-medium text-muted-foreground mr-1 shrink-0 flex items-center gap-1">
                <Filter className="h-3 w-3" strokeWidth={1.75} />
                <span>Lọc nhanh:</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedParentId("all");
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 border ${
                  selectedParentId === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                Tất cả <span className="font-mono tabular-nums">({sources.length})</span>
              </button>
              {parentSources.map((parent) => {
                const count = sources.filter((s) => s.parent_id === parent.id).length;
                const isSelected = selectedParentId === parent.id;
                const IconComp = getParentSourceIcon(parent.id) || Globe;
                return (
                  <button
                    type="button"
                    key={parent.id}
                    onClick={() => {
                      setSelectedParentId(isSelected ? "all" : parent.id);
                      setCurrentPage(1);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    <IconComp
                      className={`h-3 w-3 ${
                        isSelected ? "text-primary-foreground" : getParentSourceColor(parent.id)
                      }`}
                      strokeWidth={1.75}
                    />
                    <span>{parent.name}</span>
                    <span className="font-mono text-[11px] opacity-80 tabular-nums">
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Summary & Page Size */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-border text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-1.5">
                <span>
                  Hiển thị{" "}
                  <strong className="text-foreground font-mono tabular-nums">
                    {filteredSources.length}
                  </strong>{" "}
                  /{" "}
                  <span className="font-mono tabular-nums">{sources.length}</span> nguồn tin
                </span>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <span>Số dòng:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-border rounded-md px-2 py-1 text-xs bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>Tất cả</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="surface-panel overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[60px] text-center text-xs">STT</TableHead>
                  <TableHead className="text-xs">Tên nguồn</TableHead>
                  <TableHead className="text-xs">Liên kết (URL)</TableHead>
                  <TableHead className="text-xs">Nền tảng</TableHead>
                  <TableHead className="text-xs">Phân loại</TableHead>
                  <TableHead className="text-right text-xs">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-xs text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                      Đang tải danh mục nguồn...
                    </TableCell>
                  </TableRow>
                ) : filteredSources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Filter className="h-6 w-6 opacity-40" strokeWidth={1.75} />
                        <p className="text-xs font-semibold text-foreground">
                          Không tìm thấy nguồn tin nào phù hợp
                        </p>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResetFilters}
                            className="mt-1 h-8 text-xs gap-1.5"
                          >
                            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                            <span>Xóa bộ lọc</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSources.map((source, index) => {
                    const rowNumber =
                      pageSize === -1
                        ? index + 1
                        : (currentPage - 1) * pageSize + index + 1;
                    const parentName =
                      source.parent?.name ||
                      getParentSourceName(source.parent_id) ||
                      "Khác";
                    const ParentIcon =
                      getParentSourceIcon(source.parent_id) || Globe;
                    const colorClass = getParentSourceColor(source.parent_id);

                    return (
                      <TableRow key={source.id} className="text-xs">
                        <TableCell className="font-mono text-muted-foreground text-center tabular-nums">
                          {rowNumber}
                        </TableCell>
                        <TableCell className="font-semibold text-foreground">
                          {source.name}
                        </TableCell>
                        <TableCell className="max-w-xs truncate font-mono text-[11px]">
                          {source.link ? (
                            <a
                              href={source.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline max-w-[280px] truncate"
                              title={source.link}
                            >
                              <span className="truncate">{source.link}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Chưa có URL</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground border border-border">
                            <ParentIcon className={`h-3 w-3 ${colorClass}`} strokeWidth={1.75} />
                            <span>{parentName}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                            {source.type?.name || "Chưa phân loại"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(source)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                            title="Chỉnh sửa nguồn"
                          >
                            <Edit className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDelete(source.id)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Xóa nguồn"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/25">
                <div className="text-xs font-mono text-muted-foreground tabular-nums">
                  Trang <strong className="text-foreground">{currentPage}</strong> / {totalPages} ({filteredSources.length} kết quả)
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-2.5 text-xs gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Trước</span>
                  </Button>

                  <div className="flex items-center gap-1 mx-1">
                    {getPageNumbers().map((page, idx) => {
                      if (page === "...") {
                        return (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-2 text-xs text-muted-foreground"
                          >
                            ...
                          </span>
                        );
                      }
                      const isCurrent = currentPage === page;
                      return (
                        <button
                          type="button"
                          key={`page-${page}`}
                          onClick={() => setCurrentPage(page as number)}
                          className={`min-w-[30px] h-8 px-2 rounded-md text-xs font-mono font-semibold tabular-nums transition-colors ${
                            isCurrent
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="h-8 px-2.5 text-xs gap-1"
                  >
                    <span>Sau</span>
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="manual-article" className="mt-0">
          <div className="surface-panel p-6 max-w-xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Nạp đường dẫn bài viết lẻ vào luồng xử lý
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Gửi trực tiếp URL bài viết Facebook, Báo chí hoặc TikTok tới hàng đợi thu thập để n8n bóc tách nội dung, phân tích sắc thái và chụp bằng chứng số.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="article-url"
                  className="text-xs font-semibold text-foreground"
                >
                  Đường dẫn bài viết (URL)
                </label>
                <Input
                  id="article-url"
                  placeholder="https://facebook.com/... hoặc https://vnexpress.net/..."
                  value={manualArticleUrl}
                  onChange={(e) => setManualArticleUrl(e.target.value)}
                  className="w-full h-9 bg-background font-mono text-xs"
                />
              </div>

              <Button
                size="sm"
                onClick={() => void handleAddManualArticle()}
                disabled={isAddingArticle || !manualArticleUrl.trim()}
                className="h-9 text-xs gap-1.5 tactile-press"
              >
                {isAddingArticle ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Đang nạp hàng đợi...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Đưa vào hàng đợi thu thập</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Source Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingSource ? "Chỉnh sửa thông tin nguồn" : "Thêm nguồn giám sát mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tên nguồn</label>
              <Input
                placeholder="Ví dụ: Báo Hưng Yên"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Liên kết (URL)</label>
              <Input
                placeholder="https://..."
                value={formData.link}
                onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                className="bg-background font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Phân loại nguồn</label>
              <Select
                value={formData.type_id}
                onValueChange={(value) => setFormData({ ...formData, type_id: value })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Chọn phân loại" />
                </SelectTrigger>
                <SelectContent>
                  {sourceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nền tảng gốc</label>
              <Select
                value={formData.parent_id}
                onValueChange={(value) => setFormData({ ...formData, parent_id: value })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Chọn nền tảng" />
                </SelectTrigger>
                <SelectContent>
                  {parentSources.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              disabled={isLoading}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={isLoading}
              className="tactile-press"
            >
              {isLoading && <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <span>Lưu nguồn</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SourceManagement;
