interface IconProps {
  className?: string;
}

export function MicrosoftTeamsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.5 3C17.88 3 19 4.12 19 5.5C19 6.88 17.88 8 16.5 8C15.12 8 14 6.88 14 5.5C14 4.12 15.12 3 16.5 3Z" fill="#5059C9"/>
      <path d="M20.5 9H14.5C13.67 9 13 9.67 13 10.5V16.5C13 17.33 13.67 18 14.5 18H15V20.5C15 21.33 15.67 22 16.5 22H18.5C19.33 22 20 21.33 20 20.5V18H20.5C21.33 18 22 17.33 22 16.5V10.5C22 9.67 21.33 9 20.5 9Z" fill="#5059C9"/>
      <path d="M10 5C11.66 5 13 6.34 13 8C13 9.66 11.66 11 10 11C8.34 11 7 9.66 7 8C7 6.34 8.34 5 10 5Z" fill="#7B83EB"/>
      <path d="M15 12H5C3.9 12 3 12.9 3 14V19C3 20.1 3.9 21 5 21H15C16.1 21 17 20.1 17 19V14C17 12.9 16.1 12 15 12Z" fill="#7B83EB"/>
      <path d="M15 12H10V21H15C16.1 21 17 20.1 17 19V14C17 12.9 16.1 12 15 12Z" fill="#5059C9" opacity="0.5"/>
    </svg>
  );
}

export function MicrosoftPlannerIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#planner_clip)">
        <path d="M8.25809 15.7412C7.22488 16.7744 5.54971 16.7744 4.5165 15.7412L0.774909 11.9996C-0.258303 10.9664 -0.258303 9.29129 0.774908 8.25809L4.5165 4.51655C5.54971 3.48335 7.22488 3.48335 8.25809 4.51655L11.9997 8.2581C13.0329 9.29129 13.0329 10.9664 11.9997 11.9996L8.25809 15.7412Z" fill="url(#planner_p0)"/>
        <path d="M8.25809 15.7412C7.22488 16.7744 5.54971 16.7744 4.5165 15.7412L0.774909 11.9996C-0.258303 10.9664 -0.258303 9.29129 0.774908 8.25809L4.5165 4.51655C5.54971 3.48335 7.22488 3.48335 8.25809 4.51655L11.9997 8.2581C13.0329 9.29129 13.0329 10.9664 11.9997 11.9996L8.25809 15.7412Z" fill="url(#planner_p1)"/>
        <path d="M0.774857 11.9999C1.80809 13.0331 3.48331 13.0331 4.51655 11.9999L15.7417 0.774926C16.7749 -0.258304 18.4501 -0.258309 19.4834 0.774914L23.225 4.51655C24.2583 5.54977 24.2583 7.22496 23.225 8.25819L11.9999 19.4832C10.9667 20.5164 9.29146 20.5164 8.25822 19.4832L0.774857 11.9999Z" fill="url(#planner_p2)"/>
        <path d="M0.774857 11.9999C1.80809 13.0331 3.48331 13.0331 4.51655 11.9999L15.7417 0.774926C16.7749 -0.258304 18.4501 -0.258309 19.4834 0.774914L23.225 4.51655C24.2583 5.54977 24.2583 7.22496 23.225 8.25819L11.9999 19.4832C10.9667 20.5164 9.29146 20.5164 8.25822 19.4832L0.774857 11.9999Z" fill="url(#planner_p3)"/>
        <path d="M4.51642 15.7413C5.54966 16.7746 7.22487 16.7746 8.25812 15.7413L15.7415 8.25803C16.7748 7.2248 18.45 7.2248 19.4832 8.25803L23.2249 11.9997C24.2582 13.0329 24.2582 14.7081 23.2249 15.7413L15.7415 23.2246C14.7083 24.2579 13.033 24.2579 11.9998 23.2246L4.51642 15.7413Z" fill="url(#planner_p4)"/>
        <path d="M4.51642 15.7413C5.54966 16.7746 7.22487 16.7746 8.25812 15.7413L15.7415 8.25803C16.7748 7.2248 18.45 7.2248 19.4832 8.25803L23.2249 11.9997C24.2582 13.0329 24.2582 14.7081 23.2249 15.7413L15.7415 23.2246C14.7083 24.2579 13.033 24.2579 11.9998 23.2246L4.51642 15.7413Z" fill="url(#planner_p5)"/>
      </g>
      <defs>
        <linearGradient id="planner_p0" x1="6.38724" y1="3.74167" x2="2.15779" y2="12.777" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8752E0"/>
          <stop offset="1" stopColor="#541278"/>
        </linearGradient>
        <linearGradient id="planner_p1" x1="8.38032" y1="11.0696" x2="4.94062" y2="7.69244" gradientUnits="userSpaceOnUse">
          <stop offset="0.12172" stopColor="#3D0D59"/>
          <stop offset="1" stopColor="#7034B0" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="planner_p2" x1="18.3701" y1="-3.33385e-05" x2="9.85717" y2="20.4192" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DB45E0"/>
          <stop offset="1" stopColor="#6C0F71"/>
        </linearGradient>
        <linearGradient id="planner_p3" x1="18.3701" y1="-3.33385e-05" x2="9.85717" y2="20.4192" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DB45E0"/>
          <stop offset="0.677403" stopColor="#A829AE"/>
          <stop offset="1" stopColor="#8F28B3"/>
        </linearGradient>
        <linearGradient id="planner_p4" x1="18.0002" y1="7.49958" x2="14.0004" y2="23.9988" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3DCBFF"/>
          <stop offset="1" stopColor="#00479E"/>
        </linearGradient>
        <linearGradient id="planner_p5" x1="18.2164" y1="7.92626" x2="10.5237" y2="22.9363" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3DCBFF"/>
          <stop offset="1" stopColor="#4A40D4"/>
        </linearGradient>
        <clipPath id="planner_clip">
          <rect width="24" height="24" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}
