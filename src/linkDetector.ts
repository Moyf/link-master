import { Text } from "@codemirror/state";

export interface LinkInfo {
	isInLink: boolean;
	linkType: "markdown" | "wiki" | null;
	linkText?: string;
	linkUrl?: string;
	linkStart?: number;
	linkEnd?: number;
	// 对于 Wiki 链接的别名支持
	isInAlias?: boolean;
	aliasText?: string;
	// 对于 Markdown 链接，区分文本和URL部分
	inTextPart?: boolean;
	inUrlPart?: boolean;
}

export class LinkDetector {
	
	/**
	 * 检测光标位置是否在链接内部
	 * @param doc CodeMirror 文档对象
	 * @param pos 光标位置
	 * @returns 链接信息
	 */
	static detectLinkAtPosition(doc: Text, pos: number): LinkInfo {
		const line = doc.lineAt(pos);
		const lineText = line.text;
		const posInLine = pos - line.from;
		
		// 检查 Wiki 链接 [[]]
		const wikiLinkInfo = this.checkWikiLink(lineText, posInLine, line.from);
		if (wikiLinkInfo.isInLink) {
			return wikiLinkInfo;
		}
		
		// 检查 Markdown 链接 []()
		const markdownLinkInfo = this.checkMarkdownLink(lineText, posInLine, line.from);
		if (markdownLinkInfo.isInLink) {
			return markdownLinkInfo;
		}
		
		return { isInLink: false, linkType: null };
	}
	
	/**
	 * 检查 Wiki 链接 [[link text]] 或 [[link|alias]]
	 */
	private static checkWikiLink(lineText: string, posInLine: number, lineStart: number): LinkInfo {
		const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
		let match;
		
		while ((match = wikiLinkRegex.exec(lineText)) !== null) {
			const linkStart = match.index;
			const linkEnd = match.index + match[0].length;
			const textStart = match.index + 2; // [[之后
			const textEnd = match.index + match[0].length - 2; // ]]之前
			
			// 检查光标是否在链接内部（不包括括号）
			if (posInLine >= textStart && posInLine <= textEnd) {
				const fullContent = match[1];
				const pipeIndex = fullContent.indexOf('|');
				
				if (pipeIndex === -1) {
					// 没有别名的简单 Wiki 链接
					return {
						isInLink: true,
						linkType: "wiki",
						linkText: fullContent,
						linkStart: lineStart + linkStart,
						linkEnd: lineStart + linkEnd,
						isInAlias: false
					};
				} else {
					// 有别名的 Wiki 链接 [[link|alias]]
					const linkPart = fullContent.substring(0, pipeIndex);
					const aliasPart = fullContent.substring(pipeIndex + 1);
					const pipePosition = textStart + pipeIndex;
					
					// 判断光标在 | 前面还是后面
					const isInAlias = posInLine > pipePosition;
					
					return {
						isInLink: true,
						linkType: "wiki",
						linkText: isInAlias ? aliasPart : linkPart,
						linkUrl: linkPart, // 原始链接
						aliasText: aliasPart,
						linkStart: lineStart + linkStart,
						linkEnd: lineStart + linkEnd,
						isInAlias: isInAlias
					};
				}
			}
		}
		
		return { isInLink: false, linkType: null };
	}
	
	/**
	 * 检查 Markdown 链接 [text](url)
	 */
	private static checkMarkdownLink(lineText: string, posInLine: number, lineStart: number): LinkInfo {
		const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
		let match;
		
		while ((match = markdownLinkRegex.exec(lineText)) !== null) {
			const linkStart = match.index;
			const linkEnd = match.index + match[0].length;
			const textStart = match.index + 1; // [之后
			const textEnd = match.index + 1 + match[1].length; // ]之前
			const urlStart = match.index + match[0].indexOf('(') + 1; // (之后
			const urlEnd = match.index + match[0].length - 1; // )之前
			
			// 主要检测光标是否在 URL 部分 (B)
			if (posInLine >= urlStart && posInLine <= urlEnd) {
				return {
					isInLink: true,
					linkType: "markdown",
					linkText: match[1],
					linkUrl: match[2],
					linkStart: lineStart + linkStart,
					linkEnd: lineStart + linkEnd,
					inTextPart: false,
					inUrlPart: true
				};
			}
			
			// 也检测文本部分，但标记为不同类型
			if (posInLine >= textStart && posInLine <= textEnd) {
				return {
					isInLink: true,
					linkType: "markdown",
					linkText: match[1],
					linkUrl: match[2],
					linkStart: lineStart + linkStart,
					linkEnd: lineStart + linkEnd,
					inTextPart: true,
					inUrlPart: false
				};
			}
		}
		
		return { isInLink: false, linkType: null };
	}
	
	/**
	 * 格式化光标位置信息
	 */
	static formatCursorInfo(doc: Text, pos: number, linkInfo: LinkInfo): string {
		const line = doc.lineAt(pos);
		const column = pos - line.from;
		
		let info = `Cursor at Line ${line.number}, Column ${column + 1}`;
		
		if (linkInfo.isInLink) {
			if (linkInfo.linkType === "markdown") {
				if (linkInfo.inUrlPart) {
					info += ` | Inside Markdown link URL: "${linkInfo.linkUrl}" (text: "${linkInfo.linkText}")`;
				} else if (linkInfo.inTextPart) {
					info += ` | Inside Markdown link TEXT: "${linkInfo.linkText}" (url: "${linkInfo.linkUrl}")`;
				}
			} else if (linkInfo.linkType === "wiki") {
				if (linkInfo.isInAlias !== undefined) {
					if (linkInfo.isInAlias) {
						info += ` | Inside Wiki link ALIAS: "${linkInfo.aliasText}" (link: "${linkInfo.linkUrl}")`;
					} else {
						info += ` | Inside Wiki link TARGET: "${linkInfo.linkText}" (alias: "${linkInfo.aliasText}")`;
					}
				} else {
					info += ` | Inside Wiki link: "${linkInfo.linkText}"`;
				}
			}
		} else {
			info += " | Not in link";
		}
		
		return info;
	}
}