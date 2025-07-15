import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { toggleLeftPanel, toggleRightPanel } from '@/features/presentationSlice'
import './ViewerResizer.css'

export default function ViewerResizer() {
    const dispatch = useDispatch()
    const showLeft = useSelector(s => s.presentation.panelConfig.open.left)
    const showRight = useSelector(s => s.presentation.panelConfig.open.right)

    return (
        <div id="viewer-resizer">
            <button
                className={`material-symbols-rounded ${!showLeft ? 'flipped' : ''}`}
                onClick={() => dispatch(toggleLeftPanel())}
            >chevron_left</button>
            <button
                className={`material-symbols-rounded ${!showRight ? 'flipped' : ''}`}
                onClick={() => dispatch(toggleRightPanel())}
            >chevron_right</button>
        </div>
    )
}