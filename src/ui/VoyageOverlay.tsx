import { getShipProgress } from '../simulation/queries';
import { planetById } from '../simulation/locations';
import type { PlayerView, Ship } from '../simulation/types';

export function VoyageOverlay({ view, ship, onClose, onDestination }: {
    view: PlayerView;
    ship: Ship;
    onClose: () => void;
    onDestination: () => void;
}) {
    const progress = getShipProgress(view, ship);
    const status = ship.status === 'lost' ? '已确认损失' : ship.status === 'arrived' ? '已确认抵达' : view.time < ship.departsAt ? '建造与装载中' : view.time >= ship.arrivesAt ? '按计划应已抵达 · 等待报告' : '预计航行中';
    return <aside className="target-console voyage-console" aria-label="选中舰船">
        <button className="overlay-close" onClick={onClose} aria-label="关闭航行详情">×</button>
        <small>航行计划 / {status}</small>
        <h2>{ship.name}</h2>
        <p>{planetById(view.systems, ship.originId)?.name} → {planetById(view.systems, ship.targetId)?.name}</p>
        <progress aria-label="预计航程进度" value={progress} max={1}/>
        <div className="voyage-numbers"><span><small>预计航程</small>{(progress * 100).toFixed(1)}%</span><span><small>{view.time < ship.departsAt ? '距计划出发' : '距计划抵达'}</small>{Math.max(0, (view.time < ship.departsAt ? ship.departsAt : ship.arrivesAt) - view.time).toFixed(1)} 年</span><span><small>航速</small>{(ship.velocityC * 100).toFixed(1)}% c</span></div>
        <p className="voyage-caveat">标记按已知计划推算，不代表实时遥测。实际结果须等待报告。</p>
        <div className="target-actions"><button onClick={onDestination}>查看目的地 ↗</button><button onClick={onClose}>返回观测目标</button></div>
    </aside>;
}

