import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import '@mdi/font/css/materialdesignicons.css';

export default defineNuxtPlugin( nuxtApp => {
    const vuetify = createVuetify({
        components
    });

    nuxtApp.vueApp.use( vuetify );
});
