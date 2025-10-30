import { PluginValue, EditorView, ViewPlugin, Decoration, DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect, Extension } from "@codemirror/state";
import { LinkDetector, LinkInfo } from "./linkDetector";
import type LinkMaster from "../main";

// 移除状态效果，直接在 StateField 中计算

// 创建装饰器
const createLinkDecoration = (linkType: string) => {
	return Decoration.mark({
		class: `link-master-active-link`,
		attributes: {
			'data-link-type': linkType,
			'data-link-master': 'active'
		}
	});
};

// 计算装饰器的辅助函数
function computeLinkDecorations(state: any): DecorationSet {
	const selection = state.selection.main;
	const currentPos = selection.head;
	
	// 检测链接
	const linkInfo: LinkInfo = LinkDetector.detectLinkAtPosition(state.doc, currentPos);
	
	if (linkInfo.isInLink && 
		linkInfo.linkStart !== undefined && 
		linkInfo.linkEnd !== undefined && 
		linkInfo.linkType) {
		
		// 根据光标位置确定具体高亮范围
		const highlightRange = getSpecificHighlightRange(linkInfo, currentPos, state);
		
		if (highlightRange) {
			const decoration = createLinkDecoration(linkInfo.linkType);
			return Decoration.set([decoration.range(highlightRange.from, highlightRange.to)]);
		}
	}
	
	return Decoration.none;
}

// 状态字段：基于选择变化直接计算装饰器
const linkHighlightField = StateField.define<DecorationSet>({
	create(state) {
		return computeLinkDecorations(state);
	},
	update(decorations, tr) {
		// 如果选择发生变化，重新计算装饰器
		if (tr.selection !== tr.startState.selection) {
			return computeLinkDecorations(tr.state);
		}
		
		// 否则映射现有装饰器到新的文档位置
		return decorations.map(tr.changes);
	},
	
	provide: f => EditorView.decorations.from(f)
});

// 提取高亮范围计算函数
function getSpecificHighlightRange(linkInfo: LinkInfo, cursorPos: number, state: any): {from: number, to: number} | null {
	if (!linkInfo.isInLink || linkInfo.linkStart === undefined || linkInfo.linkEnd === undefined) {
		return null;
	}

	// 对于 Markdown 链接，区分文本部分和URL部分
	if (linkInfo.linkType === "markdown") {
		const line = state.doc.lineAt(cursorPos);
		const lineText = line.text;
		const linkStartInLine = linkInfo.linkStart - line.from;
		const cursorInLine = cursorPos - line.from;
		
		// 解析 Markdown 链接的结构 [text](url)
		const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
		let match;
		
		while ((match = markdownLinkRegex.exec(lineText)) !== null) {
			const matchStart = match.index;
			
			if (matchStart === linkStartInLine) {
				const textStart = matchStart + 1;
				const textEnd = matchStart + 1 + match[1].length;
				const urlStart = matchStart + match[0].indexOf('(') + 1;
				const urlEnd = matchStart + match[0].length - 1;
				
				if (cursorInLine >= textStart && cursorInLine <= textEnd) {
					return { from: line.from + textStart, to: line.from + textEnd };
				} else if (cursorInLine >= urlStart && cursorInLine <= urlEnd) {
					return { from: line.from + urlStart, to: line.from + urlEnd };
				}
				break;
			}
		}
	}
	
	// 对于 Wiki 链接
	else if (linkInfo.linkType === "wiki") {
		const line = state.doc.lineAt(cursorPos);
		const lineText = line.text;
		const linkStartInLine = linkInfo.linkStart - line.from;
		const cursorInLine = cursorPos - line.from;
		
		const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
		let match;
		
		while ((match = wikiLinkRegex.exec(lineText)) !== null) {
			const matchStart = match.index;
			
			if (matchStart === linkStartInLine) {
				const contentStart = matchStart + 2;
				const contentEnd = matchStart + match[0].length - 2;
				const content = match[1];
				const pipeIndex = content.indexOf('|');
				
				if (pipeIndex !== -1) {
					const targetEnd = contentStart + pipeIndex;
					const aliasStart = contentStart + pipeIndex + 1;
					
					if (cursorInLine <= targetEnd) {
						return { from: line.from + contentStart, to: line.from + targetEnd };
					} else {
						return { from: line.from + aliasStart, to: line.from + contentEnd };
					}
				} else {
					return { from: line.from + contentStart, to: line.from + contentEnd };
				}
				break;
			}
		}
	}
	
	// 默认：高亮整个链接
	return { from: linkInfo.linkStart, to: linkInfo.linkEnd };
}

// 简化的主插件类 - 只负责日志输出
class LinkMasterPlugin implements PluginValue {
	private view: EditorView;
	private mainPlugin: LinkMaster | null = null;
	private lastCursorPos: number = -1;

	constructor(view: EditorView) {
		this.view = view;
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
	update(update: ViewUpdate): void {
		if (!this.mainPlugin) return;
		
		// 只在选择变化时处理
		if (update.selectionSet) {
			this.checkCursorPosition();
		}
	}

	/**
	 * 检查光标位置并输出日志
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

		// 处理链接上下文
		if (linkInfo.isInLink) {
			this.handleLinkContext(linkInfo);
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
		this.mainPlugin = null;
	}
}

// 创建视图插件
const linkMasterViewPlugin = ViewPlugin.fromClass(LinkMasterPlugin);

// 导出完整的扩展
export const linkMasterExtensions: Extension = [
	linkHighlightField,
	linkMasterViewPlugin
];

// 导出单独的插件（用于获取实例）
export const linkMasterPlugin = linkMasterViewPlugin;