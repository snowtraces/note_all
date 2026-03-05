import { useEffect, useRef } from 'react';
import { searchNotes } from '../api/noteApi';

/**
 * 计算列表指纹：拼接每条记录的关键内容字段。
 * 覆盖：新增记录（id/length）、异步回写（status/ai_summary/ai_tags/ocr_text）。
 */
function fingerprint(list) {
  return list.map(r => `${r.id}|${r.status}|${r.ai_summary}|${r.ai_tags}|${r.ocr_text?.length ?? 0}`).join(';');
}

/**
 * 探针模式：每隔 interval ms 轮询 /api/search?q，
 * 若列表指纹发生变化（新增 或 内容更新），则调用 onChanged() 触发刷新。
 *
 * @param {string}   query      当前搜索词（跟主列表保持一致）
 * @param {Array}    results    当前列表（用于比对）
 * @param {boolean}  enabled    是否启用探针（回收站模式下关闭）
 * @param {Function} onChanged  检测到变化时的回调
 * @param {number}   interval   轮询间隔，默认 5000ms
 */
export function useDataPoller({ query, results, enabled, onChanged, interval = 5000 }) {
  // 用 ref 持有最新值，避免闭包陈化问题
  const resultsRef = useRef(results);
  useEffect(() => { resultsRef.current = results; }, [results]);

  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; }, [query]);

  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(async () => {
      try {
        const fresh = await searchNotes(queryRef.current);
        const prevFp = fingerprint(resultsRef.current);
        const freshFp = fingerprint(fresh);

        if (prevFp !== freshFp) {
          onChangedRef.current(fresh);
        }
      } catch {
        // 网络抖动时静默忽略，等下次轮询
      }
    }, interval);

    return () => clearInterval(timer);
  }, [enabled, interval]);
}
