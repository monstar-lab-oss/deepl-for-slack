export interface ActionResponse {
    selected_option?: SelectedOption;
}

export interface SelectedOption {
    value?: string;
}

export interface ActionBodyResponse {
    container?: ActionBodyContainer;
    user?: ActionBodyUser;
}

export interface ActionBodyContainer {
    channel_id?: string;
    message_ts?: string;
    thread_ts?: string;
}

export interface ActionBodyUser {
    id?: string;
}
