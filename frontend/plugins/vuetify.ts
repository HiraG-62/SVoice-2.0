import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import '@mdi/font/css/materialdesignicons.css';

export default defineNuxtPlugin( nuxtApp => {
    const vuetify = createVuetify({
        components,
        // Vuetify 4 の既定は端末の設定に従う 'system' だが、画面は常に明るい配色で使う
        theme: { defaultTheme: 'light' },
    });

    nuxtApp.vueApp.use( vuetify );
});
