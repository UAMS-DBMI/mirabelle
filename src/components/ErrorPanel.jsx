import React from 'react'

import './ErrorPanel.css';

export default function ErrorPage(error) {
    console.error(error);

    return (
        <div id="error-panel">
            <h1>Oops!</h1>
            <p>Sorry, an unexpected error has occurred.</p>
            <p>
                <i>{error.message}</i>
            </p>
        </div>
    );
}