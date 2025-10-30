import { PluginValue, EditorView, ViewPlugin } from "@codemirror/view";
import { LinkDetector, LinkInfo } from "./linkDetector";
import type LinkMaster from "../main";

class LinkMasterPlugin implements PluginValue {
	private view: EditorView;
	private mainPlugin: LinkMaster | null = null;
	private lastCursorPos: number = -1;
	private highlightObserver: MutationObserver | null = null;
	private currentLinkInfo: {start: number, end: number, type: string} | null = null;
	private isInLink: boolean = false;

	constructor(view: EditorView) {
		this.view = view;
		this.setupMutationObserver();
	}

	/**
	 * 设置DOM变化监听器
	 */
	private setupMutationObserver(): void {
		this.highlightObserver = new MutationObserver((mutations) => {
			if (this.isInLink && this.currentLinkInfo) {
				// 检查是否有高亮被移除
				mutations.forEach(mutation => {
					if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
						const target = mutation.target as HTMLElement;
						if (target.classList && !target.classList.contains('link-master-active-link')) {
							// 高亮被移除，重新添加
							this.reapplyHighlight();
						}
					}
				});
			}
		});

		this.highlightObserver.observe(this.view.dom, {
			attributes: true,
			attributeFilter: ['class'],
			subtree: true
		});
	}

	/**
	 * 由主插件调用来初始化
	 */
	initializePlugin(plugin: LinkMaster) {
		this.mainPlugin = plugin;
		this.checkCursorPosition();
	}

	/**
	 * CodeMirror 自动调用此方法响应编辑器状态变化
	 */
	update(): void {
		if (!this.mainPlugin) return;
		
		// 使用 requestAnimationFrame 确保在下一帧执行
		requestAnimationFrame(() => {
			this.checkCursorPosition();
		});
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

		// 更新链接状态
		this.updateLinkState(linkInfo);

		// 如果在链接内，可以添加额外的处理逻辑
		if (linkInfo.isInLink) {
			this.handleLinkContext(linkInfo);
		}
	}

	/**
	 * 更新链接状态
	 */
	private updateLinkState(linkInfo: LinkInfo): void {
		const wasInLink = this.isInLink;
		this.isInLink = linkInfo.isInLink;

		if (linkInfo.isInLink && linkInfo.linkStart !== undefined && linkInfo.linkEnd !== undefined && linkInfo.linkType) {
			const linkData = {
				start: linkInfo.linkStart,
				end: linkInfo.linkEnd,
				type: linkInfo.linkType
			};

			// 检查是否是同一个链接
			const isSameLink = this.currentLinkInfo && 
				this.currentLinkInfo.start === linkData.start && 
				this.currentLinkInfo.end === linkData.end &&
				this.currentLinkInfo.type === linkData.type;

			if (!isSameLink) {
				this.currentLinkInfo = linkData;
				this.applyHighlight();
			}
		} else {
			// 不在链接内
			if (wasInLink) {
				this.clearHighlight();
				this.currentLinkInfo = null;
			}
		}
	}

	/**
	 * 应用高亮
	 */
	private applyHighlight(): void {
		if (!this.currentLinkInfo) return;

		// 延迟应用高亮，确保DOM稳定
		setTimeout(() => {
			this.doApplyHighlight();
		}, 50);
	}

	/**
	 * 执行高亮应用
	 */
	private doApplyHighlight(): void {
		if (!this.currentLinkInfo) return;

		try {
			// 先清除现有高亮
			this.clearHighlight();

			// 查找光标位置的元素
			const cursorPos = this.view.state.selection.main.head;
			const cursorCoords = this.view.coordsAtPos(cursorPos);
			
			if (!cursorCoords) return;

			// 直接查找光标下的元素
			const elementAtCursor = document.elementFromPoint(
				cursorCoords.left, 
				cursorCoords.top
			) as HTMLElement;

			if (!elementAtCursor || !this.view.dom.contains(elementAtCursor)) return;

			// 查找最合适的链接元素
			const linkElement = this.findBestLinkElement(elementAtCursor);
			
			if (linkElement) {
				// 使用更持久的方式添加高亮
				this.addPersistentHighlight(linkElement);
				console.log(`[Link Master] ✨ Applied persistent highlight to:`, linkElement.className);
			}
		} catch (error) {
			console.warn('[Link Master] Error applying highlight:', error);
		}
	}

	/**
	 * 查找最佳的链接元素
	 */
	private findBestLinkElement(element: HTMLElement): HTMLElement | null {
		let current: HTMLElement | null = element;
		let depth = 0;

		while (current && depth < 8) {
			const classes = current.className || '';
			
			// 优先查找具体的链接类
			if (classes.includes('cm-link') && !classes.includes('cm-formatting')) {
				return current;
			}
			if (classes.includes('cm-url') && !classes.includes('cm-formatting')) {
				return current;
			}
			if (classes.includes('cm-hmd-internal-link')) {
				return current;
			}

			current = current.parentElement;
			depth++;
		}

		// 如果没找到，返回原始元素（如果它包含文本）
		if (element.textContent && element.textContent.trim()) {
			return element;
		}

		return null;
	}

	/**
	 * 添加持久化高亮
	 */
	private addPersistentHighlight(element: HTMLElement): void {
		// 添加CSS类
		element.classList.add('link-master-active-link');
		element.setAttribute('data-link-type', this.currentLinkInfo!.type);
		element.setAttribute('data-link-master', 'active');

		// 添加内联样式作为备用
		const originalStyle = element.getAttribute('style') || '';
		const highlightStyle = this.getHighlightStyle(this.currentLinkInfo!.type);
		element.setAttribute('style', originalStyle + highlightStyle);
		element.setAttribute('data-original-style', originalStyle);

		console.log(`[Link Master] Added persistent highlight with style backup`);
	}

	/**
	 * 获取高亮样式
	 */
	private getHighlightStyle(linkType: string): string {
		const styles = {
			wiki: 'background-color: rgba(100, 200, 255, 0.25) !important; border-radius: 3px; padding: 2px 4px; margin: -2px -4px; box-shadow: 0 0 0 1px rgba(100, 200, 255, 0.5);',
			markdown: 'background-color: rgba(255, 150, 100, 0.25) !important; border-radius: 3px; padding: 2px 4px; margin: -2px -4px; box-shadow: 0 0 0 1px rgba(255, 150, 100, 0.5);'
		};
		
		return styles[linkType as keyof typeof styles] || styles.wiki;
	}

	/**
	 * 重新应用高亮
	 */
	private reapplyHighlight(): void {
		if (this.currentLinkInfo && this.isInLink) {
			console.log('[Link Master] Reapplying highlight after DOM change');
			setTimeout(() => {
				this.doApplyHighlight();
			}, 10);
		}
	}

	/**
	 * 清除高亮
	 */
	private clearHighlight(): void {
		try {
			// 清理CSS类高亮
			const highlightedElements = this.view.dom.querySelectorAll('.link-master-active-link');
			highlightedElements.forEach(el => {
				el.classList.remove('link-master-active-link');
				el.removeAttribute('data-link-type');
				el.removeAttribute('data-link-master');
				
				// 恢复原始样式
				const originalStyle = el.getAttribute('data-original-style');
				if (originalStyle !== null) {
					el.setAttribute('style', originalStyle);
					el.removeAttribute('data-original-style');
				}
			});

			console.log(`[Link Master] 🧹 Cleared ${highlightedElements.length} highlighted elements`);
		} catch (error) {
			console.warn('[Link Master] Error clearing highlight:', error);
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
		if (this.highlightObserver) {
			this.highlightObserver.disconnect();
			this.highlightObserver = null;
		}
		this.clearHighlight();
		this.isInLink = false;
		this.currentLinkInfo = null;
		this.mainPlugin = null;
	}
}

// 导出 ViewPlugin 实例
export const linkMasterPlugin = ViewPlugin.fromClass(LinkMasterPlugin);