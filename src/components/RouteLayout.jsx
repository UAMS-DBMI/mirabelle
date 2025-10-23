import React from 'react';
import { useSelector } from 'react-redux';
import ErrorBoundary from './ErrorBoundary';

import './RouteLayout.css';
import TestError from './TestError';

function RouteLayout({
    // topPanel,
    leftPanel,
    middlePanel,
    rightPanel,
    showLeftPanel,
    showRightPanel,
    routeName,
}) {

    const leftPanelVisibility = useSelector(s => s.presentation.panelConfig.visibility.left);
    const rightPanelVisibility = useSelector(s => s.presentation.panelConfig.visibility.right);

    let columnsClass;

    if (leftPanelVisibility) {
        columnsClass = rightPanelVisibility ? 'main--3col' : 'main--2col-left';
    } else {
        columnsClass = rightPanelVisibility ? 'main--2col-right' : 'main--1col';
    }

    return (
        <div id="main" className={`${routeName} ${columnsClass}`}>
            {/* <div id="top-panel">
                {topPanel}
            </div> */}
            {leftPanelVisibility && (
                <div
                    id="left-panel"
                    className={showLeftPanel ? '' : 'collapsed'}
                >
                    {leftPanel}
                </div>
            )}
            <ErrorBoundary>
                <div id="middle-panel">{middlePanel}</div>
            </ErrorBoundary>
            {rightPanelVisibility && (
                <div
                    id="right-panel"
                    className={showRightPanel ? '' : 'collapsed'}
                >
                    {rightPanel}
                </div>
            )}
        </div>
    );
}

export default RouteLayout;