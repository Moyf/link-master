import { PluginValue, EditorView, ViewPlugin } from "@codemirror/view";
import { LinkDetector, LinkInfo } from "./linkDetector";
import type LinkMaster from "../main";

class LinkMasterPlugin implements PluginValue {
	private view: EditorView;
	private mainPlugin: LinkMaster | null = null;
	private lastCursorPos: number = -1;
	private updateTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(view: EditorView) {
		this.view = view;
	}

	/**
	 * 由主插件调用来初始化
	 */
	initializePlugin(plugin: LinkMaster) {
		this.mainPlugin = plugin;
		// 立即检查当前位置
		this.checkCursorPosition();
	}

	/**
	 * CodeMirror 自动调用此方法响应编辑器状态变化
	 */
	update(): void {
		if (!this.mainPlugin) return;
		
		// 防抖处理，避免过于频繁的更新
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
		
		this.updateTimeout = setTimeout(() => {
			this.checkCursorPosition();
			this.updateTimeout = null;
		}, 100);
	}

	/**
	 * 检查光标位置并打印信息
	 */
	private checkCursorPosition(): void {
		const state = this.view.state;
		const selection = state.selection.main;
		const currentPos = selection.head;

		// 只有当光标位置真正改变时才处理
		if (currentPos === this.lastCursorPos) return;

		this.lastCursorPos = currentPos;

		// 检测链接
		const linkInfo: LinkInfo = LinkDetector.detectLinkAtPosition(state.doc, currentPos);

		// 格式化并打印信息
		const positionInfo = LinkDetector.formatCursorInfo(state.doc, currentPos, linkInfo);
		console.log(`[Link Master] ${positionInfo}`);

		// 更新高亮
		this.updateHighlighting(linkInfo);

		// 如果在链接内，可以添加额外的处理逻辑
		if (linkInfo.isInLink) {
			this.handleLinkContext(linkInfo);
		}
	}

	/**
	 * 更新高亮显示
	 */
	private updateHighlighting(linkInfo: LinkInfo): void {
		// 先清除所有高亮
		this.clearAllHighlights();

		// 如果在链接内，添加高亮
		if (linkInfo.isInLink && linkInfo.linkStart !== undefined && linkInfo.linkEnd !== undefined && linkInfo.linkType) {
			// 使用更稳定的方法添加高亮
			this.addHighlightByInsertion(linkInfo.linkStart, linkInfo.linkEnd, linkInfo.linkType);
		}
	}

	/**
	 * 通过插入临时元素的方式添加高亮
	 */
	private addHighlightByInsertion(start: number, end: number, linkType: string): void {
		try {
			const state = this.view.state;
			const line = state.doc.lineAt(start);
			const lineStart = line.from;
			const lineEnd = line.to;
			
			// 获取整行文本
			const lineText = line.text;
			const startInLine = start - lineStart;
			const endInLine = end - lineStart;
			
			// 构建带高亮的HTML
			const beforeText = lineText.substring(0, startInLine);
			const linkText = lineText.substring(startInLine, endInLine);
			const afterText = lineText.substring(endInLine);
			
			console.log(`[Link Master] 🎯 Highlighting "${linkText}" (${linkType}) at line ${line.number}`);
			
			// 查找对应的DOM行元素
			const lineElement = this.findLineElement(line.number);
			if (lineElement) {
				// 创建高亮版本的内容
				const highlightedHTML = 
					this.escapeHtml(beforeText) +
					`<span class="link-master-active-link" data-link-type="${linkType}" data-link-master="active">` +
					this.escapeHtml(linkText) +
					`</span>` +
					this.escapeHtml(afterText);
				
				// 暂时保存原始内容
				const originalHTML = lineElement.innerHTML;
				
				// 应用高亮
				lineElement.innerHTML = highlightedHTML;
				
				console.log(`[Link Master] ✨ Applied ${linkType} link highlight`);
				
				// 设置定时器，在光标移出时恢复
				setTimeout(() => {
					if (lineElement.innerHTML === highlightedHTML) {
						lineElement.innerHTML = originalHTML;
					}
				}, 100);
			}
		} catch (error) {
			console.warn('[Link Master] Error adding highlight by insertion:', error);
		}
	}

	/**
	 * 查找指定行号的DOM元素
	 */
	private findLineElement(lineNumber: number): HTMLElement | null {
		try {
			// 在编辑器DOM中查找行元素
			const lineElements = this.view.dom.querySelectorAll('.cm-line');
			if (lineElements.length >= lineNumber) {
				return lineElements[lineNumber - 1] as HTMLElement;
			}
			
			// 备用方法：通过属性查找
			const lineElement = this.view.dom.querySelector(`[data-line="${lineNumber}"]`) as HTMLElement;
			if (lineElement) return lineElement;
			
			// 最后的方法：遍历查找
			for (let i = 0; i < lineElements.length; i++) {
				const element = lineElements[i] as HTMLElement;
				if (element && element.textContent) {
					// 这里可以添加更多的行匹配逻辑
					return element;
				}
			}
		} catch (error) {
			console.warn('[Link Master] Error finding line element:', error);
		}
		
		return null;
	}

	/**
	 * HTML转义
	 */
	private escapeHtml(text: string): string {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	/**
	 * 清除所有高亮
	 */
	private clearAllHighlights(): void {
		try {
			const highlightedElements = this.view.dom.querySelectorAll('.link-master-active-link');
			highlightedElements.forEach(el => {
				const parent = el.parentNode;
				if (parent) {
					// 用文本内容替换高亮元素
					const textNode = document.createTextNode(el.textContent || '');
					parent.replaceChild(textNode, el);
				}
			});
		} catch (error) {
			console.warn('[Link Master] Error clearing highlights:', error);
		}
	}

	/**
	 * 处理在链接内的特殊逻辑
	 */
	private handleLinkContext(linkInfo: LinkInfo): void {
		if (linkInfo.linkType === "wiki") {
			if (linkInfo.isInAlias !== undefined) {
				if (linkInfo.isInAlias) {
					console.log(`[Link Master] 🏷️ Wiki link alias detected: "${linkInfo.aliasText}" -> "${linkInfo.linkUrl}"`);
				} else {
					console.log(`[Link Master] 🔗 Wiki link target detected: "${linkInfo.linkText}" (has alias: "${linkInfo.aliasText}")`);
				}
			} else {
				console.log(`[Link Master] 🔗 Simple wiki link detected: "${linkInfo.linkText}"`);
			}
		} else if (linkInfo.linkType === "markdown") {
			if (linkInfo.inUrlPart) {
				console.log(`[Link Master] 🌐 Markdown URL detected: "${linkInfo.linkUrl}"`);
			} else if (linkInfo.inTextPart) {
				console.log(`[Link Master] 📝 Markdown text detected: "${linkInfo.linkText}"`);
			}
		}
	}

	/**
	 * 插件销毁时调用
	 */
	destroy(): void {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
			this.updateTimeout = null;
		}
		this.clearAllHighlights();
		this.mainPlugin = null;
	}
}

// 导出 ViewPlugin 实例
export const linkMasterPlugin = ViewPlugin.fromClass(LinkMasterPlugin);