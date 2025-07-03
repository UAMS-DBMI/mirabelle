import React from 'react';
import ErrorBoundary from './ErrorBoundary';

import './RouteLayout.css';
import TestError from './TestError';

function RouteLayout({ leftPanel, middlePanel, rightPanel, showLeftPanel, showRightPanel }) {

    let colsClass;

    if (showLeftPanel) {
        colsClass = showRightPanel ? 'main--3col' : 'main--2col-left';
    } else {
        colsClass = showRightPanel ? 'main--2col-right' : 'main--1col';
    }

    return (
        <div id="main" className="main--3col">
            <div
                id="left-panel"
                className={showLeftPanel ? '' : 'collapsed'}
            >
                {leftPanel}
            </div>
            <ErrorBoundary>
                <div id="middle-panel">{middlePanel}</div>
            </ErrorBoundary>
            <div
                id="right-panel"
                className={showRightPanel ? '' : 'collapsed'}
            >
                {rightPanel}
            </div>
        </div>
    );
}

export default RouteLayout;