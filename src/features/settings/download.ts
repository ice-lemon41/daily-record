export interface TextDownload {
  fileName: string;
  text: string;
  mimeType: string;
}

/** 用 Blob + 临时 <a download> 触发浏览器下载（PRD FR-10）。 */
export function downloadText({ fileName, text, mimeType }: TextDownload): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();

  // 立即 revoke 会让部分浏览器取消下载，放到下一轮事件循环。
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
