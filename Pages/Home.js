import React from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, ImageBackground, SafeAreaView } from 'react-native';

export default function App({ navigation }) {
    return (
        <ImageBackground
            source={require("../Assets/bg.png")}
            style={styles.background}
            resizeMode="cover"
        >
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.container}>
                    {/* Heading above the logo */}
                    <Text style={styles.headerTitle}>REMOTE CH4 MONITORING</Text>

                    {/* Logo Section */}
                    <View style={[styles.logoContainer, styles.elevation]}>
                        <Image 
                            style={styles.logo} 
                            source={require('../Assets/logo.png')} 
                            resizeMode="contain"
                        /> 
                    </View>

                    <View style={[styles.borealpicContainer, styles.elevation]}>
                        <Image 
                            style={styles.borealpic} 
                            source={require('../Assets/Laser.png')} 
                            resizeMode="contain"
                        /> 
                    </View>                    
                </View>

                {/* Navigation Button for New Page */}
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('SelectPage')}
                >
                    <Text style={styles.buttonText}>Go to Main Page</Text>
                </TouchableOpacity>

                <Text style={styles.version}>V1.68 B 2025</Text>
                <Text style={styles.subText}>Powered by SONIC</Text>
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    headerTitle: {
        fontSize: 35,
        fontWeight: '800',
        color: '#dae0d9ff',
        textAlign: 'center',
        marginBottom: 12,
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    logoContainer: {
        width: '100%',
        height: '15%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 5,
        marginTop: 25,
        padding: 10,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 15,
    },
    elevation: {
        elevation: 50,
        shadowColor: '#000',
    },
    logo: {
        width: "70%",
        height: "70%",
        resizeMode: 'contain',
    },
    borealpic: {
        width: '98%',
        height: '98%',
        opacity: 0.8,
    },
    borealpicContainer: {
        width: '100%',
        height: '45%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.58)',
        borderRadius: 5,
        marginTop: 25,
        padding: 8,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 15,
    },
    boreallogo : {
        width: 150,
        height: 200,
        resizeMode: 'contain',
        position: 'absolute',
        bottom: 10,
        alignSelf: 'center',
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: '900',
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        width: '80%'
    },
    subText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.86)',
        textAlign: 'center',
        marginBottom: 30
    },
    version: {
        fontSize: 20,
        color: 'rgba(255, 255, 255, 0.66)',
        textAlign: 'center',
        marginBottom: 30
    },
    button: {
        backgroundColor: 'rgba(255, 255, 255, 0.58)',
        paddingVertical: 15,
        paddingHorizontal: 40,
        borderRadius: 15,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5,
        marginBottom: 10,
        width: '70%',
        alignSelf: 'center'
    },
    buttonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
    },
});