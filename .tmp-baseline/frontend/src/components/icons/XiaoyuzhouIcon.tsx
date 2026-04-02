import React from "react"

export function XiaoyuzhouIcon({ className }: { className?: string }) {
    return (
        <svg
            role="img"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <circle cx="12" cy="12" r="10" fill="#3D9DE1" />
            <path
                d="M4.5 16.5C4.5 16.5 7 13 12 11C17 9 20.5 8.5 20.5 8.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <circle cx="15.5" cy="8.5" r="1.5" fill="white" />
        </svg>
    )
}
